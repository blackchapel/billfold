/** A file attached to a bill typed in by hand. Vercel refuses request bodies over 4.5 MB, so 4 MB of file leaves room for the form. */
export const BILL_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const BILL_UPLOAD_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";
