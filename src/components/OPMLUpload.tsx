import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import { isValidOPMLContent, getOPMLStats } from '../lib/opml-parser';

interface OPMLUploadProps {
  onSuccess?: () => void;
  minimal?: boolean;
}

export const OPMLUpload = ({ onSuccess, minimal = false }: OPMLUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { importOPML, isImporting } = useSubscriptionStorage();

  const handleFile = useCallback(async (file: File) => {
    // Validate file type
    if (!file.name.endsWith('.opml') && !file.name.endsWith('.xml')) {
      setUploadStatus('error');
      setErrorMessage('Please upload a valid OPML file (.opml or .xml)');
      return;
    }

    try {
      setUploadStatus('processing');
      setErrorMessage('');

      // Read file content
      const content = await file.text();

      // Validate OPML content
      if (!isValidOPMLContent(content)) {
        throw new Error('Invalid OPML format. Please upload a valid YouTube subscriptions export.');
      }

      // Get stats before importing
      const stats = getOPMLStats(content);
      if (!stats.isValid) {
        throw new Error(stats.error || 'Invalid OPML file');
      }

      if (stats.channelCount === 0) {
        throw new Error('No subscriptions found in this file');
      }

      // Import OPML
      const subscriptions = await importOPML(content);

      setImportedCount(subscriptions.length);
      setUploadStatus('success');

      // Call success callback after a short delay
      setTimeout(() => {
        onSuccess?.();
      }, 1500);
    } catch (error) {
      setUploadStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to import OPML file');
      console.error('OPML import error:', error);
    }
  }, [importOPML, onSuccess]);

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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Minimal button version for header
  if (minimal) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".opml,.xml"
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
          <span className="hidden sm:inline">Import</span>
        </motion.button>
      </>
    );
  }

  // Full upload screen version
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
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
          <p className="text-gray-600 dark:text-gray-400">
            Get started by uploading your YouTube subscriptions OPML file
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
                accept=".opml,.xml"
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
                    : 'border-gray-300 dark:border-gray-700 hover:border-red-400 hover:bg-gray-50 dark:hover:bg-gray-900/50'
                }`}
              >
                <Upload className={`w-16 h-16 mx-auto mb-4 ${isDragging ? 'text-red-500' : 'text-gray-400'}`} />
                <h3 className="text-xl font-semibold mb-2">
                  {isDragging ? 'Drop your OPML file here' : 'Drag and drop your OPML file'}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  or click to browse
                </p>
                <p className="text-sm text-gray-500">
                  Accepts .opml and .xml files
                </p>
              </div>

              <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-blue-900 dark:text-blue-100">
                  <ExternalLink className="w-4 h-4" />
                  How to export from YouTube
                </h4>
                <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-2 list-decimal list-inside">
                  <li>Go to <a href="https://www.youtube.com/feed/channels" target="_blank" rel="noopener noreferrer" className="underline font-medium">YouTube Subscriptions</a></li>
                  <li>Scroll to the bottom and click "Export subscriptions"</li>
                  <li>Save the .opml file to your computer</li>
                  <li>Upload it here to get started!</li>
                </ol>
              </div>
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
              <p className="text-gray-600 dark:text-gray-400">
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
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {importedCount} channel{importedCount !== 1 ? 's' : ''} added to your subscriptions
              </p>
              <button
                onClick={resetUpload}
                className="px-6 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
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
