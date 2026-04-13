# Chawp Storage Bucket Setup

This folder contains SQL scripts to set up the Supabase storage bucket for the Chawp app.

## Quick Setup

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **"New bucket"**
4. Enter the following details:

   - **Bucket name:** `chawp`
   - **Public bucket:** ✅ Enable (checked)
   - Click **"Create bucket"**

5. Set up policies:
   - Go to **SQL Editor** in the left sidebar
   - Click **"New query"**
   - Copy and paste the contents of `create-storage-bucket-simple.sql`
   - Click **"Run"** or press `Ctrl+Enter`

### Option 2: Using SQL Editor Only

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **"New query"**
4. Copy and paste the contents of `create-storage-bucket.sql`
5. Click **"Run"** or press `Ctrl+Enter`

## File Structure

- `create-storage-bucket.sql` - Full setup with advanced policies
- `create-storage-bucket-simple.sql` - Simple setup with basic policies

## Storage Structure

The `chawp` bucket will store files in the following structure:

```
chawp/
├── avatars/          # User profile pictures
│   └── {user_id}_{timestamp}.jpg
├── meals/            # Meal images
│   └── {meal_id}.jpg
├── vendors/          # Vendor/restaurant images
│   └── {vendor_id}.jpg
├── banners/          # App banners and promotions
│   └── {banner_id}.jpg
└── categories/       # Category icons
    └── {category_id}.jpg
```

## Security Policies

### Public Access

- ✅ Anyone can **view/download** files (public bucket)
- ✅ Authenticated users can **upload** files
- ✅ Authenticated users can **update** their own files
- ✅ Authenticated users can **delete** their own files

### File Restrictions

- **Max file size:** 50MB
- **Allowed types:** JPEG, JPG, PNG, GIF, WebP

## Verification

After running the SQL, verify the bucket was created:

1. Go to **Storage** in Supabase dashboard
2. You should see a bucket named **"chawp"** with a 🌐 globe icon (indicating it's public)
3. Click on the bucket to view its contents (should be empty initially)

## Testing Upload

You can test the upload functionality:

1. Open the Chawp app
2. Go to **Profile** page
3. Tap on the profile picture
4. Select an image from your gallery
5. The image should upload and display immediately

## Troubleshooting

### "Bucket already exists" error

- The bucket was already created. You can skip the bucket creation step.
- Just run the policies section of the SQL.

### "Permission denied" error

- Make sure you're authenticated in the app
- Check that the storage policies were created correctly
- Verify the bucket is set to public

### Upload fails silently

- Check browser/app console for errors
- Verify the Supabase URL and keys are correct in your config
- Ensure the file size is under 50MB

## Additional Resources

- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [Storage Policies Guide](https://supabase.com/docs/guides/storage/security/access-control)
