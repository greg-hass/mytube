import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { Header } from './Header';

export const VideoPlayer = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();

  if (!videoId) {
    navigate('/');
    return null;
  }

  const openInYouTube = () => {
    window.open(`https://youtube.com/watch?v=${videoId}`, '_blank');
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

        {/* Video Player */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden"
        >
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
              title="YouTube video player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute top-0 left-0 w-full h-full"
            />
          </div>

          {/* Open in YouTube Button */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={openInYouTube}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open in YouTube</span>
            </button>
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
            💡 You're watching this video in-app! Use the button above to open it in YouTube for additional features like comments and descriptions.
          </p>
        </motion.div>
      </div>
    </div>
  );
};
