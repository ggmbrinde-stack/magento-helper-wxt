# Magento PP custom-option page: behaviour and integration reference

## Status and scope

- Observation date: 2026-11-13, Europe/Lisbon.
- Status: documented investigation baseline, pending independent review. Recommendations are proposals, not implemented or accepted product changes.
- Target: authenticated Magento custom-option edit page, record 966, on bestofgifts.pt.
- Safe route reference: `toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/966`. Session-bound URL keys are deliberately omitted.
- Browser evidence: Chrome DevTools MCP connected to the existing authenticated Chrome session. These observations are not a REA Evidence bundle.
- Repository: `codex/release-baseline`, HEAD `cd3d2abbf4fbb5e4a9f8d5884cf05d753bd08071`.
- Product scope: future PP identification, Notion comparison, creation, duplication, correction and restructuring. Product assignment is excluded. Editing a PP already used by products may nevertheless affect them.
- Inspection only: General/Options tab navigation and bounded DOM/component/source inspection. No save, creation, duplication, deletion, field edits, request replay, reload or business-handler execution.

This document preserves the previous investigation. Documentation creation did not repeat the Magento inspection. The page may have changed since the observation.

## 1. Evidence register and reproducibility

The references below identify observations in the BOG Studio REA chat. They are local document labels, not tool-issued immutable evidence IDs. No raw capture, credential-bearing response or portable runtime bundle was saved.

| Reference | Evidence |
|---|---|
| E1 | Chrome DevTools MCP listed and selected existing Magento page 6, matching the authorized record route. Page IDs are session-local. |
| E2 | General DOM fields, selected values, translation controls, loaded script paths and extension markers. |
| E3 | Options DOM, original tables, location keys, item parent values and catalogue selections after native Options tab activation. |
| E4 | Already loaded RequireJS module methods and Magento UI registry component metadata/provider data, read without invoking business methods. |
| E5 | 56 component values matched their initialization values; neither tab carried the changed marker. |
| E6 | Five GET template resources returned 200 during Options rendering. No save request was observed. |
| E7 | Narrow source reads of the extension files listed below at the recorded HEAD. |

To repeat safely: select the existing matching authenticated page; read original fields and already loaded component state; inspect General and Options without changing values; exclude extension clones; redact URL/form keys before emitting results. Do not reload an unsaved form or invoke Save merely to discover its request. Browser inspection cannot establish all server-side rules.

## 2. Record identity and business code

| Identity | Observed value | Meaning and limit |
|---|---|---|
| Custom-option entity | `966` | Route and provider `attributesetcustomoptions_id`. |
| Magento Attribute Set | `479` | Provider top-level value and General multiselect selection. |
| Business PP label | `PP0482` | Appears in selected set label `AS>PP0482_BRINDES Tampografia + Laser Metal - Até 7cm2 (1F)`. No dedicated PP-code field was established. |
| General title | `PP_BRINDES Tampografia + Laser Metal - Até 7cm2 (1F) - Copy` | Whitespace normalized here. The Copy suffix does not prove a duplication mechanism. |

General component data stores `attribute_set_id: ["479"]`, while the provider also holds top-level `attribute_set_id: "479"`. Preserve this distinction when inspecting the native payload model.

The title says 1F, but the live Options collection contains Face 1 and Face 2. Treat this as an unresolved discrepancy. Do not infer that Face 2 should be deleted.

Target business PP codes are allocated internally by the team. Do not derive them from Magento entity IDs, row indexes or a guessed sequence.

## 3. General controls and translations

Observed fields:

| Native field name | Observed state |
|---|---|
| `general[option_title]` | Current title above; component validation `required-entry: true`. |
| `general[attribute_set_id]` | Multiselect with 1,064 choices, selected value 479; component `required-entry: false`. |
| `general[option_type]` | Value `6`, label Print. |
| `general[is_required]` | Provider value `"1"`; checked in the DOM. |
| `general[description]` | Blank. |
| `general[sort_order]` | Blank; displayed guidance says 0 at top, 99 at bottom. |
| `general[info_message]` | Blank. |
| `general[placeholder]` | Blank at base level; translated placeholders populated. |
| `general[price]`, `general[max_characters]`, `general[allowed_extensions]` | Present but hidden for the observed type. |
| `general[translationsData]` | Hidden JSON translation aggregate. |

HTML required flags alone do not describe validation. The option-title component requires a value even though the DOM input's HTML `required` property was false.

| Store ID | Language |
|---|---|
| 1 | PT |
| 2 | EN |
| 4 | ES |
| 5 | FR |
| 6 | DE |
| 7 | IT |

Each language section contains Option Title, Description, Info Message and Placeholder. Example PT values include Tipo de Personalização and Personalização. Fields are named `general[translations][storeId][field]`.

Loaded Toogas translations logic collects nonempty translated values, serializes them into `general[translationsData]`, then triggers its change event. Empty-value deletion and backend fallback semantics remain untested.

No global store switcher was observed. PT was the default in the provider's store list and the selected store in the inspected rows. This does not establish a global Magento request store scope.

## 4. Options: locations and translations

Stable table selector: `table[data-index="sub_options"]`.

Native input pattern: `options[sub_options][sub_options][row][field]`.

Fields include name, description, image, price, sort, store view and key_id. Columns depend on option type, so visible columns alone are not the full data model.

| Row record_id | key_id | PT name | Other name translations | Sort | Store |
|---|---|---|---|---|---|
| 0 | `key_7efiq9` | Face 1 | EN Side 1; ES Cara 1; FR Face 1; DE Fläche 1; IT Lato 1 | blank | 1 |
| 1 | `key_00fkik` | Face 2 | EN Side 2; ES Cara 2; FR Face 2; DE Fläche 2; IT Lato 2 | blank | 1 |

The main name field stores a JSON object keyed by store ID. Per-store controls use an additional `[storeId]` suffix. The loaded text component's change handler updates the JSON value through the component observable.

The key_id controls are disabled in the DOM, but key_id remains present in provider data. Disabled HTML serialization rules must not be mistaken for the native provider's submission contract.

Blank sort values are distinct from explicit zero. Row order, sort fields and any internal ordering properties must be preserved separately until server ordering rules are established.

## 5. Options Items and parent binding

Stable table selector: `table[data-index="sub_options_items"]`.

Native input pattern: `options[sub_options_items][sub_options_items][row][field]`.

| record_id | Parent key | Parent label | name_option | Catalogue label, abbreviated | name | Sort |
|---|---|---|---|---|---|---|
| 0 | `key_7efiq9` | Face 1 | 1 | Tampografia 1 Cor | 1 | 1 |
| 1 | `key_7efiq9` | Face 1 | 6 | Laser Metal - Até 7 cm2 | 6 | 3 |
| 2 | `key_00fkik` | Face 2 | 1 | Tampografia 1 Cor | blank | blank |
| 3 | `key_00fkik` | Face 2 | 6 | Laser Metal - Até 7 cm2 | blank | blank |

All four rows select store 1. Other inspected item fields include price and per-store name controls.

The catalogue has 142 entries. Values 1 and 6 are observed catalogue values, not parent identifiers or PP codes. Technique/size information appears in labels; no separate normalized size model was established.

`name_option` and `name` are different fields. Both have required validation in the inspected item components, while Face 2 name values were blank. This is a validation question for a later controlled test, not a demonstrated Save failure.

The parent component is `Toogas_AttributeSetCustomOptions/js/form/element/dynamicSelect`. It links to the location collection and active row store. Its loaded `setDynamicOptions` method uses key_id when the key mode is enabled and available; otherwise it uses record_id. Labels come from translated location JSON, falling back to another available translation.

For this page, actual parent values are the location key_id strings. Duplication must verify how new keys/record identities are generated and how every item parent is remapped. Never assume copied database IDs or row indexes are safe.

## 6. Runtime lifecycle and native save

Observed framework: Magento UI components with RequireJS and Knockout. The visible form area binds to:

`toogas_attributesetcustomoptions_attributesetcustomoptions_form.areas`

Native provider:

`toogas_attributesetcustomoptions_attributesetcustomoptions_form.attributesetcustomoptions_form_data_source`

Provider collections:

- `data.options.sub_options.sub_options`
- `data.options.sub_options_items.sub_options_items`

Both dynamic-row components use identificationProperty `record_id`, deleteProperty `delete` and deleteValue `true`.

Already loaded custom modules cover translations, dynamic rows, record visibility, text fields, key fields, dynamic parent selection, uploader behaviour, validation and type switching.

Observed loaded logic:

- Native Add controls bind to `processingAddChild`; they were not clicked.
- Record visibility depends on option_type and each field's optionsVisible configuration.
- The switcher mixin hides the Options navigation entry for types 0, 1 and 4.
- Custom row-removal code considers parent references matching record_id or key_id. Its execution and backend cascade behaviour were not tested.
- Translation changes update component/provider state, rather than relying solely on flat HTML names.

Native Save flow, established by reading loaded methods and configuration:

1. Form `save` calls validation.
2. Validation resets the invalid flag, triggers provider `data.validate`, and checks additional fields.
3. If valid, submit collects additional fields and delegates to provider.save.
4. Provider passes its data to the Magento form client.
5. The client uses the configured save destination. With redirect false, its loaded code appends `back/edit`.

Observed save route, with session key omitted:

`toogas_attributesetcustomoptions/attributesetcustomoptions/save`

Observed `ajaxSave: false`. No separate validation URL was configured in the inspected provider. This does not prove absence of server validation.

At initial inspection, document.forms exposed only the search form. The edit interface is component-backed; a generic FormData extraction would not capture its full contract. In particular, provider state contains disabled keys and fields not represented by a simple native edit form.

Back, Delete, Save and Save and Continue Edit are present. Create and Duplicate routes were not established; Delete's request contract was not established. No supported custom-module REST API has been proven.

### 6a. Live findings, 18 November, entity 42

Added from DevTools probes on the live edit page. They confirm the component-backed reading
above and add the parts the helper needs.

- The Items table is `admin__dynamic-rows`, `data-role="grid"`, `data-index="sub_options_items"`,
  with rows carrying `class="data-row"` and `data-repeat-index`.
- `window.ko` is absent. Knockout is reachable only through RequireJS, `require(['ko'], ...)`,
  and `ko.contextFor(row).$data` is the dynamic-rows component, not the row record.
- The component's record array is `elems`, inherited from the component prototype, so it does
  not appear in the instance's own property names. Its modules are `storage`, `dnd` and
  `parentComponent`, and the `dnd` module is what rewrites `elems` when a row is dragged. Any
  order change has to reach that array.
- The page exposes only `form-search` in `document.forms`, and a hook on
  `HTMLFormElement.prototype.submit` and on the `submit` event captured nothing, which fits the
  component-backed save flow described above.
- Per-row fields observed: `[parent]` (select, value `key_pjupep`), `[name_option]` (select,
  the catalogue id), `[name]` (hidden, same id, but empty on one live row), `[name][1]` to
  `[name][7]` for the store views, `[price]`, `[sort]` and `[store_view]`.
- `[sort]` values 1 and 2 were written through `input` and `change` events and stored, and the
  stored order did not follow them. Sort is not proven to control the order of items.

Order lane detail, open questions and the experiments that settle them are in
[PP-PREVIEW-PROGRESS-2026-11-18.md](PP-PREVIEW-PROGRESS-2026-11-18.md).

## 7. Draft state, network coverage and freshness

At the sampled point, 56 component values matched their initialization values, and General/Options lacked the changed marker. This does not cover every possible hidden state or prove that no other user changed the server record.

Options activation produced five observed successful GET requests for already configured rendering templates: dynamic rows, drag handle, Toogas text, uploader and action-delete. No write request or save response was captured.

Do not treat the network observation as a complete historical request log. Do not replay requests or save a live PP to discover missing contracts.

## 8. Existing BOG Helper integration

Observed extension markers included mhx-ui-link, theme/select styles, mhx-opt-toggle, mhx-items-toggle and mhx-items-panel. Toolkit CSS loaded through an installed Chrome extension URL. Exact installed build/version equivalence to repository HEAD is unverified.

Source pointers, repository-relative at the recorded HEAD:

| Source | Established source behaviour |
|---|---|
| `src/page/features/options-companion/index.ts:18` | Page detection uses the custom-module route substring. |
| `src/page/features/options-companion/index.ts:35` | Inserts language companion rows; proxies language/sort changes through original inputs and events. |
| `src/page/features/options-companion/index.ts:156` | Finds the location table by headers and toggles original/parallel presentation. |
| `src/page/features/options-items/index.ts:73` | Builds grouped items from the original table's parent selections. |
| `src/page/features/options-items/index.ts:209` | Clones catalogue selects; store selects are cloned at line 229. |
| `src/page/features/options-items/index.ts:279` | Watches direct tbody child-list changes, clears the enhanced marker and rebuilds the panel. |
| `src/page/features/dropdowns/index.ts:88` | Disabled-aware native select writes, followed by input/change events. |
| `src/page/features/dropdowns/index.ts:149` | Mount/synchronization infrastructure; destroy removes observers/listeners and restores the native select. |
| `src/page/features/dropdowns/scan.ts:18` | Enhances existing long selects. |
| `src/page/features/registry.ts:64` | Registers option companion and item mounts. |
| `src/shared/featureCatalog.ts:261` | Option feature settings/defaults and detection. |
| `src/entrypoints/content.ts:42` | Runs enabled feature mounts with per-feature error isolation. |
| `src/entrypoints/content.ts:145` | Debounced DOM rescan, filtering extension-only mutations. |

Observed clone caveat: grouped-panel selectors retain original names, IDs and data-bind attributes. They have no data-form-part attribute in this snapshot. This is not proof of duplicate submission, but a broad DOM reader can count cloned controls twice. Scope reads to original tables or native provider state.

Candidate lifecycle concern requiring independent review: the item observer clears its mount marker before rebuilding, and the outer mount uses that marker for idempotency. Validate repeated mounts, duplicate panels/observers, value synchronization and cleanup before extending this pattern. No runtime reproduction of a lifecycle failure was attempted.

## 9. Proposed integration contract and first slice

Recommendations only; no product changes were made.

- Add one read-only comparison panel beside the native General/Options sections, outside Knockout-managed row ownership. Preserve native tabs, controls, validation and Save.
- Identify the page through the module route and entity ID. Use stable collection/component scopes and table data-index selectors, not generated input IDs or labels.
- Keep entity ID, Attribute Set IDs, verified business PP code and Notion record identity separate.
- Read originals/provider state, exclude extension clones, and retain both name and name_option.
- Preserve location keys, names/translations, physical order, explicit or blank sort, store values and untouched metadata. The team supplies any future replacement map.
- Distinguish current draft, component initialization baseline, last independently read saved state and Notion revision. Timestamp observations; timestamps alone do not prove freshness.
- Surface missing/ambiguous identities and discrepancies without guessing a match.
- Give the panel one mount owner, bounded resynchronization, stale-response protection and explicit cleanup when the tab/section or document is replaced.
- A future cross-world extension bridge, if needed for Magento component state, should expose only the necessary structured reads. This investigation does not establish such a bridge as implemented.
- Retain existing Notion read/writer boundaries. A documentation write does not authorize operational catalog or Magento writes.

First implementation slice: read-only PP identity, current-page summary and linked Notion comparison with explicit freshness and ambiguity states. No create/edit automation in that slice.

Related catalog identifiers supplied in the investigation brief: page `417b6705ae1f81aabd8bf1130a9b991c`, data source `431b6705-ae1f-83db-b71c-0739778f9e1a`. They were not queried during this page investigation; this document does not define or certify their schema.

## 10. Required evidence before future writes

| Gap | Required controlled verification |
|---|---|
| Create/duplicate contract | Establish module-supported route, required payload and internally supplied target code on an approved safe example. |
| Child identities | Observe new key/record generation and parent remapping; prove source record is unchanged. |
| Server validation | Check required fields, catalogue/name consistency, translation handling and error responses. |
| Ordering | Verify blank versus explicit sort values and persistence of location/item order. |
| Concurrency | Re-read before applying, detect changes since preview and reject stale operations. |
| Uncertain Save outcome | Reconcile by authoritative read before retry; establish duplicate prevention rather than blind resubmission. |
| Existing product effects | Establish Attribute Set/product dependency and whether editing this PP propagates. No product assignment task is implied. |
| Read-back | Verify saved identity, every preserved location/translation, changed assignments and expected unchanged fields. |
| Extension lifecycle | Independently review and test repeated mounts, synchronization, native validation and cleanup. |

No application tests, write trials, backend inspection or independent review were performed for this baseline. Existing business rules, customer-facing impact and API support remain partially unknown.
