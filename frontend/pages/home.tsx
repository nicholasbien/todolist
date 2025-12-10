import Head from 'next/head';
import Link from 'next/link';
import { Bot, Users, Smartphone, Mail, MessageSquare, BookOpen } from 'lucide-react';

export default function HomePage() {
  return (
    <>
      <Head>
        <title>todolist.nyc - AI-Powered Collaborative Task Management</title>
        <meta name="description" content="Smart task management with AI categorization, collaborative spaces, and offline-first PWA." />
      </Head>

      <div className="min-h-screen bg-zinc-950">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <header className="text-center pt-20 pb-16">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-100 mb-6">
              todolist.nyc
            </h1>
            <p className="text-lg sm:text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
              AI-powered collaborative task management
            </p>
            <a
              href="https://app.todolist.nyc"
              className="inline-block bg-accent text-white px-8 py-4 rounded-full text-lg font-semibold hover:bg-accent-light transition-all transform hover:scale-105 shadow-xl"
            >
              Open Web App
            </a>
          </header>

          {/* Features */}
          <section className="bg-black border border-gray-800 rounded-3xl shadow-2xl p-8 sm:p-12 mb-12 max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-100 mb-12">
              Everything you need to stay organized
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <Bot className="w-12 h-12 text-accent" />
                </div>
                <h3 className="text-xl font-semibold text-gray-100 mb-2">
                  Smart AI Categorization
                </h3>
                <p className="text-gray-400">
                  Tasks are automatically organized using AI-powered categorization
                </p>
              </div>

              {/* Feature 2 */}
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <MessageSquare className="w-12 h-12 text-accent" />
                </div>
                <h3 className="text-xl font-semibold text-gray-100 mb-2">
                  AI Assistant
                </h3>
                <p className="text-gray-400">
                  Ask questions about your tasks and get intelligent answers
                </p>
              </div>

              {/* Feature 3 */}
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <BookOpen className="w-12 h-12 text-accent" />
                </div>
                <h3 className="text-xl font-semibold text-gray-100 mb-2">
                  Integrated Journal
                </h3>
                <p className="text-gray-400">
                  Keep daily notes and reflections alongside your tasks
                </p>
              </div>

              {/* Feature 4 */}
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <Mail className="w-12 h-12 text-accent" />
                </div>
                <h3 className="text-xl font-semibold text-gray-100 mb-2">
                  Daily Email Summaries
                </h3>
                <p className="text-gray-400">
                  Get AI-generated summaries of your tasks and progress
                </p>
              </div>

              {/* Feature 5 */}
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <Users className="w-12 h-12 text-accent" />
                </div>
                <h3 className="text-xl font-semibold text-gray-100 mb-2">
                  Collaborative Spaces
                </h3>
                <p className="text-gray-400">
                  Create shared workspaces and invite friends or family
                </p>
              </div>

              {/* Feature 6 */}
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <Smartphone className="w-12 h-12 text-accent" />
                </div>
                <h3 className="text-xl font-semibold text-gray-100 mb-2">
                  Offline-First
                </h3>
                <p className="text-gray-400">
                  Works seamlessly offline with automatic sync when you're back online
                </p>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="text-center pb-12 text-gray-400">
            <div className="space-x-6 mb-4">
              <Link href="/privacy" className="hover:text-accent transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-accent transition-colors">
                Terms of Service
              </Link>
              <Link href="/support" className="hover:text-accent transition-colors">
                Support
              </Link>
            </div>
            <p className="text-gray-500 text-sm">
              &copy; 2025 todolist.nyc. All rights reserved.
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
