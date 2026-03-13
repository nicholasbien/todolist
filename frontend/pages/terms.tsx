import Head from 'next/head';
import Link from 'next/link';

export default function TermsPage() {
  return (
    <>
      <Head>
        <title>Terms of Service - todolist</title>
      </Head>

      <div className="min-h-screen min-h-[100dvh] bg-zinc-950">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <Link href="/home" className="text-accent hover:text-accent-light mb-8 inline-block transition-colors">
            ← Back to Home
          </Link>

          <header className="border-b-2 border-accent pb-6 mb-8">
            <h1 className="text-4xl font-bold text-accent mb-2">Terms of Service</h1>
            <p className="text-gray-400">Last updated: December 2025</p>
          </header>

          <div className="prose prose-invert max-w-none">
            <p className="text-lg mb-6 text-gray-300">
              By using todolist (&quot;the service&quot;), you agree to these Terms.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">1. Using the Service</h2>
            <p className="mb-4 text-gray-300">
              You must provide a valid email to create an account.<br />
              You are responsible for keeping your account secure.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">2. What the Service Provides</h2>
            <p className="mb-4 text-gray-300">
              The app offers task management, journal features, collaborative spaces, offline support, and AI-powered features using OpenAI&apos;s API.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">3. Acceptable Use</h2>
            <p className="mb-4 text-gray-300">You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li>Break any laws</li>
              <li>Harass or harm other users</li>
              <li>Upload illegal or abusive content</li>
              <li>Attempt unauthorized access</li>
              <li>Interfere with the app or servers</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">4. Your Content</h2>
            <p className="mb-4 text-gray-300">
              You retain ownership of your tasks, journals, and workspace data.<br />
              You give us permission to store and process this data to provide the service, including sending it to OpenAI for AI features.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">5. Service Changes</h2>
            <p className="mb-4 text-gray-300">
              We may modify, suspend, or discontinue features at any time.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">6. Termination</h2>
            <p className="mb-4 text-gray-300">
              You may delete your account at any time.<br />
              We may suspend accounts that violate these Terms.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">7. Disclaimer</h2>
            <p className="mb-4 text-gray-300">
              The service is provided &quot;as is,&quot; without warranties of any kind.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">8. Liability</h2>
            <p className="mb-4 text-gray-300">
              To the fullest extent permitted by law, we are not liable for indirect or consequential damages.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">9. Governing Law</h2>
            <p className="mb-4 text-gray-300">
              These Terms follow the laws of New York, USA.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">10. Contact</h2>
            <p className="mb-4 text-gray-300">
              <a href="mailto:todolist.notifications@gmail.com" className="text-accent hover:text-accent-light">Contact Us</a>
            </p>
          </div>

          <footer className="mt-12 pt-6 border-t border-gray-800 text-center text-gray-400">
            <div className="mb-2">
              <Link href="/home" className="hover:text-accent transition-colors">Home</Link>
              {' • '}
              <Link href="/privacy" className="hover:text-accent transition-colors">Privacy</Link>
              {' • '}
              <a href="mailto:todolist.notifications@gmail.com" className="hover:text-accent transition-colors">Contact</a>
            </div>
            <p className="text-gray-500 text-sm">&copy; 2026 todolist</p>
          </footer>
        </div>
      </div>
    </>
  );
}
