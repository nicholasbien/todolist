import Head from 'next/head';
import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      <Head>
        <title>todolist.nyc - AI-Powered Collaborative Task Management</title>
        <meta name="description" content="Smart task management with AI categorization, collaborative spaces, and offline-first PWA." />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-indigo-700">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <header className="text-center pt-20 pb-16">
            <h1 className="text-5xl sm:text-6xl font-bold text-white mb-6">
              todolist.nyc
            </h1>
            <p className="text-xl sm:text-2xl text-white/90 mb-10 max-w-2xl mx-auto">
              AI-powered collaborative task management for teams and individuals
            </p>
            <a
              href="https://app.todolist.nyc"
              className="inline-block bg-white text-purple-600 px-8 py-4 rounded-full text-lg font-semibold hover:bg-gray-100 transition-all transform hover:scale-105 shadow-xl"
            >
              Open Web App
            </a>
          </header>

          {/* Features */}
          <section className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 mb-12 max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-800 mb-12">
              Everything you need to stay organized
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="text-center">
                <div className="text-5xl mb-4">🤖</div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                  Smart AI Categorization
                </h3>
                <p className="text-gray-600">
                  Tasks are automatically organized using AI-powered categorization
                </p>
              </div>

              {/* Feature 2 */}
              <div className="text-center">
                <div className="text-5xl mb-4">👥</div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                  Collaborative Spaces
                </h3>
                <p className="text-gray-600">
                  Create shared workspaces and invite team members or family
                </p>
              </div>

              {/* Feature 3 */}
              <div className="text-center">
                <div className="text-5xl mb-4">📱</div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                  Offline-First PWA
                </h3>
                <p className="text-gray-600">
                  Works seamlessly offline with automatic sync when you're back online
                </p>
              </div>

              {/* Feature 4 */}
              <div className="text-center">
                <div className="text-5xl mb-4">✉️</div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                  Daily Email Summaries
                </h3>
                <p className="text-gray-600">
                  Get AI-generated summaries of your tasks and progress
                </p>
              </div>

              {/* Feature 5 */}
              <div className="text-center">
                <div className="text-5xl mb-4">💬</div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                  AI Assistant
                </h3>
                <p className="text-gray-600">
                  Ask questions about your tasks and get intelligent answers
                </p>
              </div>

              {/* Feature 6 */}
              <div className="text-center">
                <div className="text-5xl mb-4">📔</div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                  Integrated Journal
                </h3>
                <p className="text-gray-600">
                  Keep daily notes and reflections alongside your tasks
                </p>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="text-center pb-12 text-white">
            <div className="space-x-6 mb-4">
              <Link href="/privacy" className="hover:underline">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:underline">
                Terms of Service
              </Link>
              <Link href="/support" className="hover:underline">
                Support
              </Link>
            </div>
            <p className="text-white/70 text-sm">
              &copy; 2025 todolist.nyc. All rights reserved.
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
