# Drime Cloud Setup for BOG Studio

## Quick Start

### 1. Create Drime Account
1. Go to [drime.cloud](https://drime.cloud) and sign up
2. Free plan: **20 GB storage**, REST API access included

### 2. Create API Token
1. Sign in to [Drime Dashboard](https://app.drime.cloud)
2. Go to **Settings → Developers** (or [direct link](https://app.drime.cloud/account-settings#developers))
3. Under **API access tokens**, click **Create token**
4. Name: `BOG Studio Extension`
5. Permissions: **Restricted** → Files: **Write** (includes Read)
6. Click **Create** and **copy the token** (shown only once!)

### 3. Configure Extension
In your extension side panel, store:
```json
{
  "enabled": true,
  "apiToken": "your-token-from-step-2",
  "workspaceId": 0,
  "maxFileSize": 52428800
}
```

### 4. Add Host Permission
In `wxt.config.ts`, add to `host_permissions`:
```typescript
'https://app.drime.cloud/*',
```

---

## API Overview

### Base URL
```
https://app.drime.cloud/api/v1
```

### Authentication
All requests require Bearer token:
```
Authorization: Bearer YOUR_API_TOKEN
```

### Key Endpoints

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Upload file | `/uploads` | POST (multipart) |
| List files | `/drive/file-entries` | GET |
| Download file | `/file-entries/download/{hash}` | GET |
| Delete files | `/file-entries/delete` | POST |
| Create folder | `/folders` | POST |
| Space usage | `/user/space-usage` | GET |
| User info | `/users/me` | GET |

---

## Extension Integration

### Import the Client
```typescript
import {
  uploadProductImage,
  listProductImages,
  getAllProductImages,
  deleteProductImages,
  getDrimeConfig,
  setDrimeConfig,
  isDrimeEnabled,
  testConnection,
  getSpaceUsage,
  DrimeFileEntry,
} from '../shared/drime';
```

### Upload Product Image
```typescript
async function handleImageUpload(sku: string, file: File, variant?: 'base' | 'thumbnail' | 'gallery' | 'swatch') {
  if (!await isDrimeEnabled()) {
    throw new Error('Drime storage not configured');
  }
  
  try {
    const fileEntry = await uploadProductImage(sku, file, variant);
    console.log('Uploaded:', fileEntry.name, 'Hash:', fileEntry.hash);
    return fileEntry;
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
}
```

### List Product Images
```typescript
async function getProductImages(sku: string) {
  const images = await listProductImages(sku); // all variants
  // or specific variant:
  const thumbs = await listProductImages(sku, 'thumbnail');
  return images;
}
```

### Get Image URL for Display
```typescript
function getImageUrl(hash: string): string {
  return `https://app.drime.cloud/api/v1/file-entries/download/${hash}`;
}

// Use in img tag:
// <img src={getImageUrl(fileEntry.hash)} alt={fileEntry.name} />
// Note: Requires Authorization header - use fetch with credentials
```

### Download Image (for display in extension)
```typescript
async function loadImageForDisplay(hash: string): Promise<string> {
  const config = await getDrimeConfig();
  const response = await fetch(`https://app.drime.cloud/api/v1/file-entries/download/${hash}`, {
    headers: { 'Authorization': `Bearer ${config.apiToken}` },
  });
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
```

### Check Storage Usage
```typescript
async function showStorageStatus() {
  const usage = await getSpaceUsage();
  console.log(`Used: ${(usage.used / 1024 / 1024).toFixed(1)} MB / ${(usage.total / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Available: ${(usage.available / 1024 / 1024).toFixed(1)} MB (${usage.percentage}% used)`);
  return usage;
}
```

---

## Folder Structure

Files are organized automatically:
```
BOG Studio/
├── SKU-001/
│   ├── base/
│   │   ├── image1.jpg
│   │   └── image2.png
│   ├── thumbnail/
│   │   └── thumb_image1.jpg
│   ├── gallery/
│   │   └── gallery_image1.jpg
│   └── swatch/
│       └── swatch_image1.jpg
├── SKU-002/
│   └── ...
```

---

## Free Tier Limits

| Resource | Limit |
|----------|-------|
| Storage | 20 GB |
| API Access | Included |
| File Upload | Simple: < 5MB, Multipart: larger |
| Workspaces | 2 people free |

---

## Important Notes

1. **No direct image URLs**: Drime doesn't provide public image URLs. Downloads require authentication. For gallery display, fetch through the extension.

2. **Rate limiting**: API has rate limits. Implement retry logic if needed.

3. **Multipart upload**: For files > 5MB, use the multipart upload flow (not implemented in basic client yet).

4. **CORS**: Drime API supports CORS for browser extensions with proper host permissions.

5. **Token security**: Never commit the API token. Store in `chrome.storage.sync`.

---

## Testing

Run connection test:
```typescript
const connected = await testConnection();
console.log('Drime connected:', connected);
```

Upload test file:
```typescript
const testFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
const result = await uploadProductImage('TEST-SKU', testFile, 'base');
console.log('Upload result:', result);
```

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| 401 Unauthorized | Check API token is correct and not revoked |
| 403 Forbidden | Token missing `files.write` scope |
| 422 Validation | Check file size, required fields |
| 429 Rate Limited | Add delay between requests |
| CORS Error | Add `https://app.drime.cloud/*` to `host_permissions` |

---

## Files Created

```
src/shared/drime.ts          # Full API client with TypeScript types
```

The client handles:
- Authentication
- Folder creation by SKU/variant
- File upload with metadata
- Listing/filtering by SKU
- Download with blob URLs
- Deletion
- Storage quota checking