import Head from 'next/head';
import Link from 'next/link';

export default function SupportPage() {
  return (
    <>
      <Head>
        <title>Support - todolist.nyc</title>
      </Head>

      <div className="min-h-screen bg-zinc-950">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <Link href="/home" className="text-accent hover:text-accent-light mb-8 inline-block transition-colors">
            ← Back to Home
          </Link>

          <header className="border-b-2 border-accent pb-6 mb-8">
            <h1 className="text-4xl font-bold text-accent mb-2">Support</h1>
          </header>

          <div className="bg-black border border-accent/30 p-6 rounded-lg mb-8">
            <h3 className="text-xl font-semibold text-accent mb-2">Get in Touch</h3>
            <p className="text-gray-300">
              <a href="mailto:todolist.notifications@gmail.com" className="text-accent hover:text-accent-light font-semibold">Contact Support</a>
            </p>
          </div>

          <div className="prose prose-invert max-w-none">
            <h2 className="text-3xl font-bold mt-8 mb-6 text-gray-100">FAQ</h2>

            <div className="space-y-6">
              {/* FAQ 1 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">Does it work offline?</h3>
                <p className="text-gray-300">
                  Yes — tasks and journals sync automatically when you're online again.
                </p>
              </div>

              {/* FAQ 2 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">How do collaborative spaces work?</h3>
                <p className="text-gray-300">
                  Create a space and invite others by email. Everyone in a space can view/edit shared content.
                </p>
              </div>

              {/* FAQ 3 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">How do I delete my account?</h3>
                <p className="text-gray-300">
                  Go to Settings → Delete Account. All data is permanently removed.
                </p>
              </div>

              {/* FAQ 4 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">Is my data sent to AI?</h3>
                <p className="text-gray-300">
                  Only when using AI features (categorization, summaries, assistant). See our <Link href="/privacy" className="text-accent hover:text-accent-light">Privacy Policy</Link>.
                </p>
              </div>

              {/* FAQ 5 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">Is todolist.nyc free?</h3>
                <p className="text-gray-300">
                  Yes!
                </p>
              </div>
            </div>
          </div>

          <footer className="mt-12 pt-6 border-t border-gray-800 text-center text-gray-400">
            <p>
              <Link href="/home" className="text-accent hover:text-accent-light">Back to Home</Link>
              {' • '}
              <Link href="/privacy" className="text-accent hover:text-accent-light">Privacy</Link>
              {' • '}
              <Link href="/terms" className="text-accent hover:text-accent-light">Terms</Link>
            </p>
            <p className="mt-2">&copy; 2025 todolist.nyc</p>
          </footer>
        </div>
      </div>
    </>
  );
}
