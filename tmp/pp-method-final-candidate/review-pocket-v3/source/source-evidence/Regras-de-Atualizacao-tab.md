
Regras de Atualização

# PP update rules from the PDF and email

Reviewed and recorded on <date start="2026-11-17" />. The user explicitly requested this summary to be saved in this tab.

## Sources and scope

- <b>PDF:</b> Personalizações Regras.pdf, all three pages, supplied and read in this conversation. Page 1 covers textiles, textile gifts and bottles; page 2 covers umbrellas/parasols, bags, notebooks and sublimation; page 3 records questions about general gifts and a powerbank example.
- <b>Email screenshot:</b> ChatGPT Image Nov 17, 2026, 11\_26\_56 AM.png, showing Manuel Gaiteiro's email titled “perfis textil”.
- <b>Direct user clarification:</b> “é para manter o A7 nas mangas compridas” (keep A7 on long sleeves).

These sources provide category rules beyond the earlier PP49 example. Where the earlier example limits the evidence to PP49, use the category rules below for the categories explicitly covered. The earlier text is retained in the historical reference at the end of this tab.

This update records business rules only. It does not approve or change individual PP configurations, IMP options, prices, database properties or Magento data.

## Category rules stated in the PDF

“One colour” and “colours” are both intended customer choices. Preserve this distinction when mapping them to technical IMP options.

| Category / location | Reference size and options | Source |
| --- | --- | --- |
| Textiles: front and back | <b>A4</b>; one colour + colours + embroidery | PDF p. 1 |
| Textiles: chest and sleeves | <b>A7</b>; one colour + colours + embroidery. <b>Keep A7 on long sleeves as well.</b> | PDF p. 1 + direct user clarification |
| Workwear with a paper/card insert | Include the paper/card insert personalisation option; the PDF explicitly answers “sim”. Preserve its actual location. | PDF p. 1 |
| Caps, bucket hats and beanies | <b>A7</b>; one colour + colours + embroidery | PDF p. 1 |
| Small towels | <b>A6</b>; one colour + colours + embroidery | PDF p. 1 |
| Bath towels and blankets | <b>A4</b>; one colour + colours + embroidery | PDF p. 1 |
| Apron chest | <b>A4</b>; one colour + colours + embroidery | PDF p. 1 |
| Apron pockets | <b>A6</b>; one colour + colours | PDF p. 1 |
| Small bags, backpacks and sacks | <b>A6</b>; one colour + colours + embroidery where applicable | PDF p. 2 |
| Large bags, backpacks and sacks | <b>A4</b>; one colour + colours + embroidery where applicable | PDF p. 2 |
| Bags below 140 g/m² | <b>Do not retain Transfer Digital.</b> The PDF explicitly answers “não”. | PDF p. 2 |
| Umbrellas | <b>A4</b>; one colour + colours; <b>four panels</b> | PDF p. 2 |
| Parasols | <b>A3</b>; one colour + colours; <b>four panels</b> | PDF p. 2 |
| Notebooks | Use the notebook's size as the reference. The A6 example uses A6 pricing, with one colour + colours + laser/thermogravure where applicable. | PDF p. 2 |
| Sublimation products | <b>Sublimation only</b>, following the size rule for the article. The illustrated notebook's new configuration retains an A5 sublimation option. | PDF p. 2 |
| Bottles | Rotary pricing. The stated example selects one colour through circular screen printing; colours through <b>UV Circular up to 260 cm²</b>; laser through <b>Laser Circular up to 50 cm²</b>, where applicable. | PDF p. 1 |

## Additional instructions in Manuel's email

- <b>Textiles, bags and backpacks:</b> one-colour printing, colour printing, textile digital transfer and embroidery.
- <b>Default prices:</b> use the A7 and A4 reference prices. Read this together with the more specific category sizes in the PDF above; it does not replace the stated A6/A3 exceptions.
- <b>Bottles and pens:</b> one-colour printing, colour printing and laser.

The email does not specify an exact IMP technique or size for every article and location.

## Unresolved questions and mapping limits

- <b>Two-colour tampography:</b> PDF p. 3 asks whether it can be retained when it is the article's only printing technique. No explicit answer is shown.
- <b>Largest size for general gifts:</b> PDF p. 3 asks whether all general gifts should use the largest size. No explicit general answer is shown.
- <b>Powerbank illustration:</b> the page shows one colour at up to 120 cm² and colours at up to 50 cm². This example does not settle the general largest-size question.
- <b>Confirmed user decision, </b><b><date start="2026-11-17" /></b><b>:</b> drop <b>Transfer Digital Têxtil</b> from the New logic. Preserve its historical references in Old and original source evidence. Transfer and DTF remain distinct processes; this decision does not remove either.
- <b>Deferred by the user, </b><b><date start="2026-11-17" /></b><b>:</b> decide later whether the customer choice “cores” maps to DTF. For PP428, DTF A4 on the chest and DTF A6 on the pocket remain proposed options, not confirmation of that business mapping.
- <b>Work that can continue:</b> page layout, Excel import verification, restoration of explicit source associations and other unambiguous corrections. The deferred “cores” mapping does not block this work, but must be resolved before final technical approval or treating the affected New configuration as confirmed.
- <b>Other technical mappings:</b> reconcile any remaining “one colour”/“colours” mappings with exact existing options. Do not assume that every technique becomes one colour or that Transfer and DTF are interchangeable.
- <b>Application:</b> retain article/material restrictions and special locations. A category rule is not proof that every existing PP proposal already follows it.

## User-confirmed correction: PP428 pocket

Recorded on <date start="2026-11-17" /> after the user rejected the proposal with the reason “Falta transfer 1 C 126cm”.

Reference: <mention url="https://app.notion.com/p/074b6705ae1f8257a53701d87a64eb32">428 — AVENTAL grande com bolso - 2F</mention>.

| Location | Original option | Confirmed New option |
| --- | --- | --- |
| Bolso | Transfer - Até 126 cm2 - 2 Cores (aprox. 11,2x11,2cm - MOCHILA) | <b>Transfer - Até 126 cm2 - 1 Cor (aprox. 11,2x11,2cm - MOCHILA)</b> |

- Retain Transfer for this confirmed pocket option; change the colour selection from 2 colours to 1 colour while preserving the exact 126 cm² specification.
- Keep DTF A6 as the existing separate proposal; it does not replace the confirmed one-colour Transfer option. The technical mapping of “colours” still needs confirmation.
- This confirms the PP428 pocket mapping. Do not infer new mappings for other profiles without checking their source, category rules and user decisions.
- The current IMP → New list omits generic Transfer entries, while the existing database option catalogue includes Transfer up to 126 cm², 1 colour. Record this discrepancy; it is not a reason to drop the user-confirmed option. This rule update does not itself edit the IMP list.
- Add the confirmed option to both the per-location New table and the global <code>Opções de personalização</code> property. Include Transfer in <code>Técnicas</code>.
- Preserve the user's rejection and explanation. Recording a correction does not mark the PP approved.

## Preservation and consistency when applying these rules

Preserve the PP code, product identity, images, notes, the Original configuration and original Excel evidence. Prepare and verify the New configuration per location, using exact existing technical option names. Keep different locations separate; do not replace their mappings with a single flat list.

<b>Updated user instruction:</b> when a reviewed New configuration is applied, the page properties must agree with it: <code>Faces</code> and <code>Número de locais possíveis</code> reflect its locations; <code>Técnicas</code> and <code>Opções de personalização</code> reflect the combined options actually assigned in New. Preserve the original values in Old/source history and record the change. This supersedes the earlier instruction to leave the global options property unchanged, which remains visible only in the historical PP49 reference below.

Unknown associations remain unresolved rather than being invented. Keep the PP <code>A rever</code> while approval is outstanding, and preserve the Yes/No decision and rejection reason for later review.

<toggle heading="h2">
Earlier PP49 example and method (historical reference)

The text below is preserved for traceability. The category rules above extend the earlier PP49-only evidence. Technique substitutions in this earlier example must not override the unresolved mapping limits above.

# PP transformation logic — validated example: PP 49

<callout icon="✅" color="green_bg">
<b>Validated basis:</b> PP 49 (adult short-sleeved T-shirts and polos). Keep the existing printing locations, but standardize the selected printing options using the <code>IMP → New</code> list. This is a reusable method, not an automatic rule for every PP. Changes to other profiles require category-specific validation and authorization.
</callout>

Reference: <mention url="https://app.notion.com/p/cbbb6705ae1f822790c601b6be542afc">49 — TÊXTIL ADULTO Manga Curta - T-shirts/Polos</mention>.

## 1. Core transformation rules

| Element | Rule |
| --- | --- |
| Código PP | Never change |
| Product name and classification | Preserve |
| Faces / Locais | Preserve all existing locations |
| Printing techniques | Use the options listed in <code>IMP → New</code> |
| Printing sizes | Use the approved reference size for each location |
| Number of colors | Follow the exact option in IMP |
| <code>Opções de personalização</code> property | <b>Keep completely unchanged</b> |
| Original Excel data | Preserve |
| Images and notes | Preserve |

## 2. Location determines the printing size

For PP 49, the validated mappings are:

| Printing location | Reference size | Matching options in IMP → New |
| --- | --- | --- |
| Peito Esquerdo / Peito Direito | <b>A7</b> | Estamparia — 1 Cor (A7); DTF — A7; Bordado — 60 cm² |
| Manga Esquerda / Manga Direita | <b>A7</b> | Estamparia — 1 Cor (A7); DTF — A7; Bordado — 60 cm² |
| Frente / Costas | <b>A4</b> | Estamparia — 1 Cor (A4); DTF — A4; Bordado — 600 cm² |

### Exact existing IMP option names used in PP 49

<b>A7 — Peito / Mangas</b>

- Estamparia - Até A7 - 1 Cor (BOLSO \| MANGA)
- DTF - Até A7 (7,4x10,5cm - BOLSO \| MANGA \| ESTOJOS)
- Bordado - Até 60 cm2 - Até 7,7x7,7 aprox. - BOLSO \| BONE \| MANGA - A7

<b>A4 — Frente / Costas</b>

- Estamparia - Até A4 - 1 Cor
- DTF - Até A4 (21x29,7cm)
- Bordado - Até 600 cm2 - Até 24,5x24,5cm aprox. - A4

The A7/A4 mapping is validated for the PP 49 example only. Other product categories may require different sizes.

## 3. How to transform individual techniques

| Technique | Transformation logic illustrated by PP 49 |
| --- | --- |
| Estamparia<br />Transfer | Replace the 4-colour selection with the corresponding 1-colour option from IMP → New<br /><br />transfer 2 cores - para 1 cor |
| DTF<br />Flex | Keep DTF, Flex selecting only the approved reference size for the location |
| Bordado | Select the IMP embroidery option corresponding to that location's reference size |
| Other techniques | Do not add or replace techniques without confirming the relevant product rules |

For example, the original Frente/Costas configuration included A3 options. The validated PP 49 example selects A4 instead. <b>A3 is excluded only from the proposed face-by-face selection, not deleted from the original technical data.</b>

## 4. Workflow for future PP updates

1. <b>Identify the PP.</b> Read its category, product characteristics, materials, and existing locations.
2. <b>Read the current configuration.</b> Extract every face/local and its associated printing options.
3. <b>Determine the correct reference size.</b> Apply the relevant PDF/email rule. For PP 49, use A7 for chest/sleeves and A4 for front/back.
4. <b>Match options against IMP → New.</b> Use the exact existing names, dimensions, and technical descriptions. Do not invent new options.
5. <b>Generate the new face-by-face configuration.</b> Retain compatible techniques, use the approved sizes, and exclude options outside the defined selection.
6. <b>Preserve original technical information.</b> Do not change the <code>Opções de personalização</code> property, original Excel data, images, or historical notes.
7. <b>Verify the result.</b> Compare Old versus New, flag uncertain compatibility, and obtain authorization before modifying a PP.

## 5. What must not be generalized

The PP 49 example confirms a method, not a universal rule for all 814 PPs.

- Do not assume that every textile item supports embroidery.
- Do not replace every Estamparia option with 1 Cor without checking the relevant approved category rules.
- Do not apply A7/A4 indiscriminately to bottles, notebooks, bags, or other product categories.
- Do not assume that the largest printing size is always the correct reference size.
- Respect special cases, including sublimation-only products and <b>PP 601 — não mexer</b>.

## 6. Reusable decision sequence

<callout icon="📐" color="gray_bg">
<b>For each existing printing location:</b>

Product category + Material + Location

→ Approved printing size

→ Matching options from IMP → New

→ New face-by-face configuration
</callout>

<b>Conclusion:</b> The PP 49 Old → New comparison is the validated transformation example for adult short-sleeved T-shirts and polos. Reuse its method for compatible profiles, while deriving other category-specific rules from Manuel's instructions.

<b>Recommended next validation:</b> Test the method against another PP in the same textile family before expanding it to other categories.

This tab documents the rules; it does not modify any existing PP records or their <code>Opções de personalização</code> property.
</toggle>
</tab>
<tab>
