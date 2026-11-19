// ============================================================
// ADMIN NAV TOGGLE DIAGNOSTIC — Browser Console
// Paste this entire block into DevTools (F12) on a Magento admin page
// ============================================================

(async () => {
  console.group('=== ADMIN NAV TOGGLE DIAGNOSTIC ===');

  // 1. COLLAPSE STATE
  const body = document.body;
  const hasHiddenClass = body?.classList.contains('mhx-nav-hidden') || false;
  console.log('\n[STATE] body.mhx-nav-hidden applied: ' + (hasHiddenClass ? 'YES' : 'NO'));

  // 2. NAV ELEMENTS
  console.log('\n--- NAV ELEMENTS ---');
  const navSelectors = [
    'nav.admin__menu', '#menu', '.admin__menu',
    'nav[aria-label="Main Menu"]', '[role="navigation"]'
  ];

  let navCount = 0;
  for (const sel of navSelectors) {
    const els = document.querySelectorAll(sel);
    for (const el of Array.from(els)) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      navCount++;
      const cs = getComputedStyle(el);
      console.log('\n[' + sel + ']');
      console.log('  display: ' + cs.display + ' | position: ' + cs.position + ' | visibility: ' + cs.visibility);
      console.log('  offsetWidth: ' + el.offsetWidth);
      const ml = parseFloat(cs.marginLeft) || 0;
      const pl = parseFloat(cs.paddingLeft) || 0;
      if (ml > 0) console.log('  WARNING: margin-left: ' + ml + 'px (NOT zeroed!)');
      if (pl > 0) console.log('  WARNING: padding-left: ' + pl + 'px (NOT zeroed!)');
    }
  }
  console.log('\nTotal nav elements: ' + navCount);

  // 3. RAIL ANCESTORS
  console.log('\n--- RAIL ANCESTORS ---');
  let railCount = 0;
  for (const sel of navSelectors) {
    const els = document.querySelectorAll(sel);
    for (const nav of Array.from(els)) {
      const navRect = nav.getBoundingClientRect();
      let base = navRect;
      if (base.width <= 0) {
        const parent = nav.parentElement;
        if (parent) base = parent.getBoundingClientRect();
      }
      if (base.width <= 0) continue;
      const maxRail = Math.min(260, Math.max(120, base.width * 2 + 60));
      let el = nav.parentElement;
      while (el && el !== document.body && el !== document.documentElement) {
        const rect = el.getBoundingClientRect();
        const sameLeft = Math.abs(rect.left - base.left) <= 8;

  // 4. CONTENT ELEMENTS
  console.log('\n--- CONTENT ELEMENTS (margin/padding) ---');
  const contentSelectors = [
    '.page-main', '.page-wrapper', '#page-wrapper', '.admin__header',
    'main', 'body', '#html-body', '[class*=wrapper]', '[class*=content]', '[role=main]'
  ];
  let contentCount = 0;
  for (const sel of contentSelectors) {
    const els = document.querySelectorAll(sel);
    for (const el of Array.from(els)) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      contentCount++;
      const cs = getComputedStyle(el);
      const ml = parseFloat(cs.marginLeft) || 0;
      const pl = parseFloat(cs.paddingLeft) || 0;
      const inlineMl = parseFloat(el.style.marginLeft) || 0;
      const inlinePl = parseFloat(el.style.paddingLeft) || 0;
      const total = ml + pl + inlineMl + inlinePl;
      const flag = total > 24 ? '  <-- ISSUE' : '';
      console.log('[' + sel + '] marginL=' + ml + 'px, paddingL=' + pl + 'px' + flag);
    }
  }
  console.log('\nTotal content elements: ' + contentCount);

  // 5. SPACE OCCUPANCY
  console.log('\n--- SPACE OCCUPANCY ---');
  const containerWidth = document.body ? document.body.scrollWidth : 0;
  let leftOccupied = 0;
  for (const sel of contentSelectors) {
    const els = document.querySelectorAll(sel);
    for (const el of Array.from(els)) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const cs = getComputedStyle(el);
      const ml = parseFloat(cs.marginLeft) || 0;
      const pl = parseFloat(cs.paddingLeft) || 0;
      if (ml > 24 || pl > 24) {
        leftOccupied += ml + pl;
      }
    }
  }
  console.log('Container width: ' + containerWidth + 'px');
  console.log('Left occupied: ' + leftOccupied.toFixed(1) + 'px');

  if (hasHiddenClass && leftOccupied > 24) {
    console.log('BUG: body.mhx-nav-hidden applied but left side still has space');
  } else if (hasHiddenClass && leftOccupied <= 24) {
    console.log('OK: Body class applied and left space cleared');
  } else {
    console.log('INFO: Body class not applied - collapse may not have run');
  }

  // 6. RAIL COLUMN VISIBILITY
  console.log('\n--- RAIL COLUMN VISIBILITY ---');
  let railVisible = false;
  for (const sel of navSelectors) {
    const els = document.querySelectorAll(sel);
    for (const nav of Array.from(els)) {
      const navRect = nav.getBoundingClientRect();
      let base = navRect;
      if (base.width <= 0) {
        const parent = nav.parentElement;
        if (parent) base = parent.getBoundingClientRect();
      }
      if (base.width <= 0) continue;
      const maxRail = Math.min(260, Math.max(120, base.width * 2 + 60));
      let el = nav.parentElement;
      while (el && el !== document.body && el !== document.documentElement) {
        const rect = el.getBoundingClientRect();
        const sameLeft = Math.abs(rect.left - base.left) <= 8;
        const nearWidth = rect.width > 0 && rect.width <= maxRail;
        const tallEnough = rect.height >= Math.max(40, base.height * 0.5);
        if (!sameLeft || !nearWidth || !tallEnough) break;
        const cs = getComputedStyle(el);
        if (cs.display !== 'none' && cs.visibility !== 'hidden') {
          console.log('Rail column is VISIBLE: ' + el.tagName + '.' + el.className);
          railVisible = true;
        }
        el = el.parentElement;
      }
    }
  }
  if (!railVisible) console.log('OK: No rail columns are visible');

  // 7. CSS RULE CHECK
  console.log('\n--- CSS RULES ---');
  let cssFound = false;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules || []);
      for (const rule of rules) {
        const text = rule.cssText || '';
        if (text.includes('mhx-nav-hidden')) {
          console.log('  ' + text.substring(0, 200));
          cssFound = true;
        }
      }
    } catch (e) {
      // Cross-origin stylesheets may be inaccessible
    }
  }
  if (!cssFound) console.log('  (no mhx-nav-hidden CSS rules found)');

  console.groupEnd();
  console.log('=== END DIAGNOSTIC ===');
})();

        const nearWidth = rect.width > 0 && rect.width <= maxRail;
        const tallEnough = rect.height >= Math.max(40, base.height * 0.5);
        if (!sameLeft || !nearWidth || !tallEnough) break;
        railCount++;
        const cs = getComputedStyle(el);
        console.log(
          '[Rail ' + railCount + '] ' + el.tagName + '.' + el.className +
          ' display: ' + cs.display + ', margin-left: ' + cs.marginLeft + ', padding-left: ' + cs.paddingLeft
        );
        el = el.parentElement;
      }
    }
  }
  console.log('\nTotal rail ancestors: ' + railCount);
})();
