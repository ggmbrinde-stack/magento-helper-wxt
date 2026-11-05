// Paste into the DevTools Console after the page finishes loading.
// Collects timing and DOM-churn metrics only; it does not read page text,
// form values, or submit/change anything.
(() => {
  const durationMs = 15_000;
  const startedAt = performance.now();
  const longTasks = [];
  const mutationsByTarget = new Map();
  let mutationRecords = 0;
  let addedNodes = 0;
  let removedNodes = 0;
  const observers = [];

  window.__mhxPagePerformanceDiagnostic?.stop?.();

  const summarizeTarget = (node) => {
    if (!(node instanceof Element)) return node?.parentElement?.tagName ?? 'other';
    const id = node.id ? `#${node.id.slice(0, 40)}` : '';
    const classes = Array.from(node.classList)
      .slice(0, 3)
      .map((name) => `.${name.slice(0, 32)}`)
      .join('');
    return `${node.tagName.toLowerCase()}${id}${classes}`.slice(0, 120);
  };

  const summarizeElement = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      element: summarizeTarget(element),
      display: style.display,
      visibility: style.visibility,
      hiddenAttribute: element.hasAttribute('hidden'),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };

  const categoryTreeSnapshot = () => {
    const checkboxSelector =
      'input.category-checkbox, input[name="add_category_ids[]"]';
    const candidates = Array.from(document.querySelectorAll('ul')).filter(
      (list) =>
        list.matches('.category-tree, #category_ids') ||
        list.querySelectorAll(checkboxSelector).length >= 3,
    );
    return candidates.slice(0, 5).map((tree) => {
      const checkboxes = Array.from(tree.querySelectorAll(checkboxSelector));
      const ancestors = [];
      for (let node = tree; node && ancestors.length < 8; node = node.parentElement) {
        ancestors.push(summarizeElement(node));
      }
      const directRows = Array.from(tree.children).filter(
        (node) => node instanceof HTMLLIElement,
      );
      const hiddenRows = Array.from(tree.querySelectorAll('li')).filter(
        (row) => getComputedStyle(row).display === 'none',
      ).length;
      const hiddenLists = Array.from(tree.querySelectorAll('ul')).filter(
        (list) => getComputedStyle(list).display === 'none',
      ).length;
      const extensionUi = Array.from(
        document.querySelectorAll('.mhx-cat-shell, .mhx-cat-main'),
      )
        .slice(0, 5)
        .map(summarizeElement);
      return {
        ...summarizeElement(tree),
        checkboxCount: checkboxes.length,
        checkedCount: checkboxes.filter((box) => box.checked).length,
        directRowCount: directRows.length,
        hiddenRowCount: hiddenRows,
        hiddenNestedListCount: hiddenLists,
        extensionCollapsedBranches: tree.querySelectorAll(
          'li[data-mhx-collapsed="1"]',
        ).length,
        ancestors,
        extensionUi,
      };
    });
  };

  const mutationObserver = new MutationObserver((records) => {
    mutationRecords += records.length;
    for (const record of records) {
      addedNodes += record.addedNodes.length;
      removedNodes += record.removedNodes.length;
      const target = summarizeTarget(record.target);
      const count = mutationsByTarget.get(target) ?? 0;
      mutationsByTarget.set(target, count + 1);
    }
  });
  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  observers.push(mutationObserver);

  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.push({
          startMs: Math.round(entry.startTime),
          durationMs: Math.round(entry.duration),
          attribution: entry.attribution
            ?.map((item) => item.containerType || item.name)
            .filter(Boolean)
            .slice(0, 3)
            .join(', ') || 'unavailable',
        });
      }
    });
    longTaskObserver.observe({ type: 'longtask', buffered: true });
    observers.push(longTaskObserver);
  }

  const stop = () => {
    for (const observer of observers) observer.disconnect();

    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const resourceSummary = new Map();
    for (const entry of resources) {
      const key = entry.initiatorType || 'other';
      const current = resourceSummary.get(key) ?? {
        count: 0,
        totalDurationMs: 0,
        slowestDurationMs: 0,
      };
      current.count += 1;
      current.totalDurationMs += entry.duration;
      current.slowestDurationMs = Math.max(current.slowestDurationMs, entry.duration);
      resourceSummary.set(key, current);
    }

    const report = {
      observedForMs: Math.round(performance.now() - startedAt),
      navigation: navigation
        ? {
            responseStartMs: Math.round(navigation.responseStart),
            domInteractiveMs: Math.round(navigation.domInteractive),
            domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
            loadEventEndMs: Math.round(navigation.loadEventEnd),
            transferSizeBytes: navigation.transferSize,
          }
        : 'unavailable',
      longTasks: {
        count: longTasks.length,
        totalDurationMs: longTasks.reduce((sum, task) => sum + task.durationMs, 0),
        longest: [...longTasks]
          .sort((a, b) => b.durationMs - a.durationMs)
          .slice(0, 10),
      },
      resourcesByInitiator: Array.from(resourceSummary, ([initiator, value]) => ({
        initiator,
        count: value.count,
        totalDurationMs: Math.round(value.totalDurationMs),
        slowestDurationMs: Math.round(value.slowestDurationMs),
      })).sort((a, b) => b.totalDurationMs - a.totalDurationMs),
      categoryTrees: categoryTreeSnapshot(),
      domMutations: {
        records: mutationRecords,
        addedNodes,
        removedNodes,
        busiestTargets: Array.from(mutationsByTarget, ([target, count]) => ({
          target,
          records: count,
        }))
          .sort((a, b) => b.records - a.records)
          .slice(0, 15),
      },
    };

    console.group('Page performance diagnostic');
    console.log('Navigation timing (since page load):', report.navigation);
    console.log('Long tasks:', report.longTasks);
    console.table(report.resourcesByInitiator);
    console.log('Category tree visibility/layout:', report.categoryTrees);
    console.log('DOM mutations during observation:', report.domMutations);
    console.log('Copy this report:', JSON.stringify(report, null, 2));
    console.groupEnd();
    delete window.__mhxPagePerformanceDiagnostic;
    return report;
  };

  const timer = window.setTimeout(stop, durationMs);
  window.__mhxPagePerformanceDiagnostic = {
    stop: () => {
      window.clearTimeout(timer);
      return stop();
    },
  };

  console.info(
    `Performance diagnostic running for ${durationMs / 1000}s. ` +
      'Wait for the report or run __mhxPagePerformanceDiagnostic.stop() to finish early.',
  );
})();
