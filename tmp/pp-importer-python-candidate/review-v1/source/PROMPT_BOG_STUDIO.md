# Prompt to paste into the BOG Studio assistant

Help me run the attached Python importer for **Perfis de Personalização (PPs)** in BOG Studio’s Notion workspace. Read `README.md`, `SETUP_NOTION.md` and `importar_pp.py` before making changes.

1. Locate the latest BOG Studio PP Excel workbook and the canonical Notion destination. Confirm the destination **data-source UUID** and compare the current database schema with `SETUP_NOTION.md`. If several files or destinations match, show me the candidates so I can identify the right one.
2. Use Python 3.11 or newer. Generate a fresh local plan with `preparar --excel <workbook> --fonte-dados <uuid> --pasta <output folder>`. Report the count by area, duplicate codes, uncoded blocks, records with review flags and the destination shown in the plan. Preserve the source workbook and keep ambiguous location groups intact.
3. Use the official Notion REST API through the importer. I’ll enter the company integration token in PowerShell. Refer to `NOTION_TOKEN` by name and keep its value out of the chat, files and logs.
4. Choose one eligible PP missing from the destination. Run a local preview and show me the code, destination and expected content. After I authorise the pilot, run it with `--codigo <code> --aplicar`. Check that the page, fields, grouped locations, notes and any images and cover match the plan.
5. Once the pilot is reviewed and I ask you to continue, apply the remaining eligible records. Existing codes should be skipped. Report how many were created, skipped and held for review, then reconcile the destination counts with the plan and the import log.

The importer creates PP pages and prepares the dropdown options. Keep later Notion corrections and the PDF pricing workflow separate from this import.
