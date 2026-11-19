# Set up the BOG Studio Notion destination

## 1. Identify the destination and grant access

Use the canonical Notion database in the company workspace. The script takes the **data-source UUID**. Retrieve the database through the Notion API to find its `data_sources` list, then select the intended source. Validate it with `GET /v1/data_sources/{data_source_id}`.

Use a company Notion connection with read, insert and update content capabilities. Give it access to the destination database. Enter the connection token only on the company PC. [Notion authorization](https://developers.notion.com/guides/authorization/overview) · [Retrieve a database](https://developers.notion.com/reference/retrieve-a-database) · [Retrieve a data source](https://developers.notion.com/reference/retrieve-a-data-source) · [API versioning](https://developers.notion.com/reference/versioning)

## 2. Check the database fields

Match names and types exactly, including accents. Reuse an existing compatible catalog and keep its current values.

| Notion field | Type | Initial values |
| --- | --- | --- |
| PP | Title | |
| Código PP | Text (`rich_text`) | |
| Área | Select | Têxtil, Brindes, Brinde têxtil |
| Família | Multi-select | Populated from the plan |
| Tipos de artigo compatíveis | Multi-select | Populated from the plan |
| Faces | Multi-select | Populated from the plan |
| Número de locais possíveis | Number | |
| Número de faces | Number | |
| Opções de personalização | Multi-select | Populated from the plan |
| Técnicas | Multi-select | Populated from the plan |
| SKU / referência do fornecedor | Text (`rich_text`) | |
| Imagem principal | Files & media | |
| Estado | Select | A rever. Preserve any existing states such as Demo, Validado and Obsoleto. |

## 3. Prepare and preview

Open PowerShell in the extracted folder and use Python 3.11 or newer. Replace the Excel path and UUID in the example. Choose an eligible code from `revisao.csv` that is absent from the destination for the first import.

```powershell
python .\importar_pp.py preparar --excel "C:\Dados\Perfis de Personalização.xlsx" --fonte-dados "<UUID_DA_FONTE_DE_DADOS>" --pasta .\plano_bog
python .\importar_pp.py importar --plano .\plano_bog\plano_importacao.json --codigo 42
```

The preview command is local. It prints the destination encoded in the plan, the counts and the requested PP. Confirm the data source and inspect the report before applying. The code 42 is an example.

## 4. Import the first PP, then the rest

Set the token in the same PowerShell session. The script also accepts `NOTION_API_KEY`.

```powershell
$ppToken = Read-Host "Token da integração Notion da BOG Studio" -AsSecureString
$env:NOTION_TOKEN = [System.Net.NetworkCredential]::new('', $ppToken).Password
python .\importar_pp.py importar --plano .\plano_bog\plano_importacao.json --codigo 42 --aplicar
```

Check the created code, title, area, location groups, options, notes, images and cover in Notion. Then use:

```powershell
python .\importar_pp.py importar --plano .\plano_bog\plano_importacao.json --aplicar
```

Importing prepares missing dropdown options automatically. To prepare only the options, use `opcoes --plano .\plano_bog\plano_importacao.json --aplicar`. Where a field would exceed 100 options, the importer adds missing names in batches on a temporary page, then places the helper page in the trash.

Run one import per destination at a time. If a request to create a page times out, a rerun will query the existing codes before it attempts to create missing PPs. Always rerun with the same plan and the original Excel until that run is complete. If a force-stop leaves `importacao.lock`, check that the process has ended before removing the file. If the helper creation timed out, check the destination for a leftover page named «Preparação temporária de opções — importador Excel».
