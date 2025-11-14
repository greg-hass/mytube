import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { Header } from './Header';

export const ChannelViewer = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();

  if (!channelId) {
    return <Navigate to="/" replace />;
  }

  const openInYouTube = () => {
    window.open(`https://youtube.com/channel/${channelId}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <Header />

      <div className="max-w-7xl mx-auto py-8 px-4">
        {/* Back Button */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 mb-6 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back</span>
        </motion.button>

        {/* Channel Embed */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden"
        >
          {/* YouTube Subscribe Button Embed */}
          <div className="relative w-full bg-gradient-to-br from-red-50 to-pink-50 dark:from-gray-800 dark:to-gray-900 p-12">
            <div className="text-center">
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  Channel Preview
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  YouTube channels can't be fully embedded, but you can open it below
                </p>
              </div>

              <button
                onClick={openInYouTube}
                className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-lg transition-all transform hover:scale-105 shadow-lg"
              >
                <ExternalLink className="w-6 h-6" />
                <span>Open Channel in YouTube</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Info Box */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
        >
          <p className="text-sm text-blue-800 dark:text-blue-200">
            💡 YouTube doesn't allow embedding full channel pages for security reasons. Click the button above to view the full channel experience on YouTube!
          </p>
        </motion.div>
      </div>
    </div>
  );
};
