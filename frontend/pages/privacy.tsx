import Head from 'next/head';
import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <>
      <Head>
        <title>Privacy Policy - your-domain.com</title>
      </Head>

      <div className="min-h-screen min-h-[100dvh] bg-zinc-950">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <Link href="/home" className="text-accent hover:text-accent-light mb-8 inline-block transition-colors">
            ← Back to Home
          </Link>

          <header className="border-b-2 border-accent pb-6 mb-8">
            <h1 className="text-4xl font-bold text-accent mb-2">Privacy Policy</h1>
            <p className="text-gray-400">Last updated: December 2025</p>
          </header>

          <div className="prose prose-invert max-w-none">
            <p className="text-lg mb-6 text-gray-300">
              your-domain.com (&quot;the app&quot;) helps you manage tasks, journals, and AI-powered features. This Privacy Policy explains what information we collect and how it is used.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">1. Information We Collect</h2>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li><strong className="text-gray-100">Email address</strong> — used only for account authentication (verification codes).</li>
              <li><strong className="text-gray-100">Tasks, journals, and workspace data</strong> — stored so the app can function.</li>
              <li><strong className="text-gray-100">AI queries</strong> — sent to OpenAI to provide AI features.</li>
              <li><strong className="text-gray-100">Device + usage info</strong> — basic app interaction data stored locally to support offline mode.</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">2. How Your Data Is Used</h2>
            <p className="mb-4 text-gray-300">We use your data to:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li>Create and manage your account</li>
              <li>Provide core features (tasks, journals, spaces, offline sync)</li>
              <li>Support AI features such as categorization and summaries</li>
              <li>Send optional email summaries or verification codes</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">3. Third-Party Services</h2>
            <p className="mb-4 text-gray-300">
              <strong className="text-gray-100">OpenAI:</strong> Certain content you create (tasks, journals, queries) is sent to OpenAI when AI features are used. OpenAI may retain this data per their policies (typically 30 days).
            </p>
            <p className="mb-4 text-gray-300">
              <strong className="text-gray-100">Email + Database Providers:</strong> Used securely to deliver verification codes, summaries, and store your account data.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">4. Data Storage & Security</h2>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li>Encrypted HTTPS connections</li>
              <li>Secure cloud database storage</li>
              <li>Local IndexedDB storage for offline mode</li>
              <li>JWT-based authentication</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">5. Your Choices</h2>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li><strong className="text-gray-100">Delete your account:</strong> In Settings → Delete Account (permanently removes all data).</li>
              <li><strong className="text-gray-100">Export your data:</strong> Available in Settings.</li>
              <li><strong className="text-gray-100">Disable email summaries:</strong> Optional feature.</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">6. Collaborative Spaces</h2>
            <p className="mb-4 text-gray-300">
              Your shared tasks and journals are visible to members of that space. Personal spaces remain private.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">7. Children</h2>
            <p className="mb-4 text-gray-300">
              The app is not intended for children under 13.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">8. Changes</h2>
            <p className="mb-4 text-gray-300">
              We may update this policy and will post the new date here.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">9. Contact</h2>
            <p className="mb-4 text-gray-300">
              <a href="mailto:todolist.notifications@gmail.com" className="text-accent hover:text-accent-light">Contact Us</a>
            </p>
          </div>

          <footer className="mt-12 pt-6 border-t border-gray-800 text-center text-gray-400">
            <div className="mb-2">
              <Link href="/home" className="hover:text-accent transition-colors">Home</Link>
              {' • '}
              <Link href="/terms" className="hover:text-accent transition-colors">Terms</Link>
              {' • '}
              <a href="mailto:todolist.notifications@gmail.com" className="hover:text-accent transition-colors">Contact</a>
            </div>
            <p className="text-gray-500 text-sm">&copy; 2026 your-domain.com</p>
          </footer>
        </div>
      </div>
    </>
  );
}
