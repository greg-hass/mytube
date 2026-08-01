import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import { parseSubscriptionImportPreview, type ImportFormat } from '../lib/opml-parser';
import type { StoredSubscription } from '../lib/indexeddb';

interface OPMLUploadProps {
  onSuccess?: () => void;
  minimal?: boolean;
  showLabelOnMobile?: boolean;
}

type PendingImport = {
  fileName: string;
  format: ImportFormat;
  newSubscriptions: StoredSubscription[];
  existingCount: number;
  duplicateCount: number;
  skippedCount: number;
};

function formatImportType(format: ImportFormat): string {
  return format === 'csv' ? 'Google Takeout CSV' : 'OPML';
}

function ImportReview({
  pendingImport,
  onConfirm,
  onCancel,
  isImporting,
}: {
  pendingImport: PendingImport;
  onConfirm: () => void;
  onCancel: () => void;
  isImporting: boolean;
}) {
  const newCount = pendingImport.newSubscriptions.length;

  return (
    <div
      role="alertdialog"
      aria-labelledby="subscription-import-review-title"
      data-testid="subscription-import-review"
      className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-left dark:border-blue-800 dark:bg-blue-950/30"
    >
      <h2 id="subscription-import-review-title" className="font-semibold text-blue-950 dark:text-blue-100">
        Review subscription import
      </h2>
      <p className="mt-1 text-sm text-blue-900 dark:text-blue-200">
        {pendingImport.fileName} · {formatImportType(pendingImport.format)}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-blue-950 dark:text-blue-100">
        <p><strong>{newCount}</strong> new channel{newCount === 1 ? '' : 's'}</p>
        <p><strong>{pendingImport.existingCount}</strong> already subscribed</p>
        <p><strong>{pendingImport.duplicateCount}</strong> duplicate entr{pendingImport.duplicateCount === 1 ? 'y' : 'ies'} skipped</p>
        <p><strong>{pendingImport.skippedCount}</strong> invalid entr{pendingImport.skippedCount === 1 ? 'y' : 'ies'} skipped</p>
      </div>
      <p className="mt-3 text-sm text-blue-900 dark:text-blue-200">
        Existing subscriptions and their favourites, mute settings, and groups will remain unchanged. Nothing is added until you confirm.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isImporting}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
        >
          Confirm import
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isImporting}
          className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-medium text-blue-900 hover:bg-blue-100 disabled:opacity-60 dark:border-blue-700 dark:text-blue-100 dark:hover:bg-blue-900/40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export const OPMLUpload = ({ onSuccess, minimal = false, showLabelOnMobile = false }: OPMLUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'review' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [importedCount, setImportedCount] = useState(0);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { rawSubscriptions, importSubscriptions, isImporting } = useSubscriptionStorage();

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.opml') && !file.name.toLowerCase().endsWith('.xml')) {
      setUploadStatus('error');
      setErrorMessage('Please upload subscriptions.csv from Google Takeout, or an OPML/XML file.');
      return;
    }

    try {
      setUploadStatus('processing');
      setErrorMessage('');

      // Read file content
      const content = await file.text();

      const preview = parseSubscriptionImportPreview(content);
      if (preview.channelCount === 0) {
        throw new Error('No subscriptions found in this file');
      }

      const existingIds = new Set(rawSubscriptions.map((subscription) => subscription.id));
      const newSubscriptions = preview.subscriptions.filter(
        (subscription) => !existingIds.has(subscription.id),
      );

      setPendingImport({
        fileName: file.name,
        format: preview.format,
        newSubscriptions,
        existingCount: preview.channelCount - newSubscriptions.length,
        duplicateCount: preview.duplicateCount,
        skippedCount: preview.skippedCount,
      });
      setUploadStatus('review');
    } catch (error) {
      setUploadStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to import subscriptions file');
      console.error('Subscription import error:', error);
    }
  }, [rawSubscriptions]);

  const handleConfirmImport = useCallback(async () => {
    if (!pendingImport) return;

    try {
      setUploadStatus('processing');
      setErrorMessage('');

      if (pendingImport.newSubscriptions.length > 0) {
        await importSubscriptions(pendingImport.newSubscriptions);
      }

      setImportedCount(pendingImport.newSubscriptions.length);
      setUploadStatus('success');
      setTimeout(() => {
        onSuccess?.();
      }, 1500);
    } catch (error) {
      setUploadStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to import subscriptions file');
      console.error('Subscription import error:', error);
    }
  }, [importSubscriptions, onSuccess, pendingImport]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const resetUpload = useCallback(() => {
    setUploadStatus('idle');
    setErrorMessage('');
    setImportedCount(0);
    setPendingImport(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const cancelImport = useCallback(() => {
    resetUpload();
  }, [resetUpload]);

  // Minimal button version for header
  if (minimal) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.opml,.xml"
          aria-label="Import subscriptions file"
          onChange={handleFileInput}
          className="hidden"
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleClick}
          disabled={isImporting}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isImporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          <span className={showLabelOnMobile ? '' : 'hidden sm:inline'}>Import</span>
        </motion.button>
        {uploadStatus === 'review' && pendingImport && (
          <ImportReview
            pendingImport={pendingImport}
            onConfirm={handleConfirmImport}
            onCancel={cancelImport}
            isImporting={isImporting}
          />
        )}
        {uploadStatus === 'processing' && (
          <p role="status" className="mt-2 text-sm text-gray-600 dark:text-ios-300">
            {pendingImport ? 'Importing subscriptions…' : 'Reading subscriptions file…'}
          </p>
        )}
        {uploadStatus === 'success' && (
          <p role="status" className="mt-2 text-sm text-green-700 dark:text-green-300">
            {importedCount > 0 ? `${importedCount} new channel${importedCount === 1 ? '' : 's'} imported.` : 'No new channels were needed.'}
          </p>
        )}
        {uploadStatus === 'error' && (
          <div role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
            <p>{errorMessage}</p>
            <button type="button" onClick={resetUpload} className="mt-1 underline">Try again</button>
          </div>
        )}
      </>
    );
  }

  // Full upload screen version
  return (
    <div className="app-shell min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-red-600 to-red-500 flex items-center justify-center">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-red-600 to-red-500 bg-clip-text text-transparent">
            Import Your Subscriptions
          </h1>
          <p className="text-gray-600 dark:text-ios-400">
            Get started with your Google Takeout subscriptions.csv file
          </p>
        </div>

        <AnimatePresence mode="wait">
          {uploadStatus === 'idle' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.opml,.xml"
                aria-label="Import subscriptions file"
                onChange={handleFileInput}
                className="hidden"
              />

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={handleClick}
                className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-300 dark:border-ios-700 hover:border-red-400 hover:bg-gray-50 dark:hover:bg-ios-900/50'
                }`}
              >
                <Upload className={`w-16 h-16 mx-auto mb-4 ${isDragging ? 'text-red-500' : 'text-gray-400'}`} />
                <h3 className="text-xl font-semibold mb-2">
                  {isDragging ? 'Drop your subscriptions file here' : 'Drag and drop your subscriptions file'}
                </h3>
                <p className="text-gray-600 dark:text-ios-400 mb-4">
                  or click to browse
                </p>
                <p className="text-sm text-gray-500">
                  Accepts Google Takeout .csv, plus .opml and .xml files
                </p>
              </div>

              <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-blue-900 dark:text-blue-100">
                  <ExternalLink className="w-4 h-4" />
                  How to export from YouTube
                </h4>
                <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-2 list-decimal list-inside">
                  <li>Open <a href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-medium">Google Takeout</a></li>
                  <li>Deselect all, then select YouTube and YouTube Music</li>
                  <li>Under included data, keep only subscriptions selected</li>
                  <li>Download the export and upload subscriptions.csv from the subscriptions folder</li>
                </ol>
              </div>
            </motion.div>
          )}

          {uploadStatus === 'review' && pendingImport && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <ImportReview
                pendingImport={pendingImport}
                onConfirm={handleConfirmImport}
                onCancel={cancelImport}
                isImporting={isImporting}
              />
            </motion.div>
          )}

          {uploadStatus === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-12"
            >
              <Loader2 className="w-16 h-16 text-red-600 animate-spin mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Processing your file...</h3>
              <p className="text-gray-600 dark:text-ios-400">
                This may take a moment
              </p>
            </motion.div>
          )}

          {uploadStatus === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-12"
            >
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Successfully imported!</h3>
              <p className="text-gray-600 dark:text-ios-400 mb-6">
                {importedCount > 0
                  ? `${importedCount} new channel${importedCount !== 1 ? 's' : ''} added to your subscriptions`
                  : 'All channels in this file were already subscribed'}
              </p>
              <button
                onClick={resetUpload}
                className="px-6 py-2 rounded-lg bg-gray-100 dark:bg-ios-800 hover:bg-gray-200 dark:hover:bg-ios-700 transition-colors"
              >
                Import More
              </button>
            </motion.div>
          )}

          {uploadStatus === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-12"
            >
              <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Import failed</h3>
              <p className="text-red-600 dark:text-red-400 mb-6">
                {errorMessage}
              </p>
              <button
                onClick={resetUpload}
                className="px-6 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                Try Again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
