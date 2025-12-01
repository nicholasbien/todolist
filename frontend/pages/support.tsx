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
              <strong className="text-gray-100">Email:</strong> <a href="mailto:todolist.notifications@gmail.com" className="text-accent hover:text-accent-light">todolist.notifications@gmail.com</a>
            </p>
            <p className="text-gray-400 text-sm mt-2">We typically respond within 24-48 hours.</p>
          </div>

          <div className="prose prose-invert max-w-none">
            <h2 className="text-3xl font-bold mt-8 mb-6 text-gray-100">Frequently Asked Questions</h2>

            <div className="space-y-6">
              {/* FAQ 1 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">How do I create an account?</h3>
                <p className="text-gray-300">
                  Simply enter your email address on the sign-up page. You'll receive a verification code via email to complete the registration process. No password required!
                </p>
              </div>

              {/* FAQ 2 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">How do collaborative spaces work?</h3>
                <p className="text-gray-300">
                  Collaborative spaces allow you to share tasks and journals with team members or family. Create a new space, invite others by email, and all members can view and edit shared content. Each user also has a personal "Default" space for private tasks.
                </p>
              </div>

              {/* FAQ 3 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">Does the app work offline?</h3>
                <p className="text-gray-300">
                  Yes! todolist.nyc is a Progressive Web App (PWA) that works offline. Your tasks and journals are stored locally on your device and automatically sync when you're back online. You can add, edit, and complete tasks even without an internet connection.
                </p>
              </div>

              {/* FAQ 4 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">What are email summaries?</h3>
                <p className="text-gray-300">
                  Email summaries are AI-generated daily or weekly summaries of your tasks and progress. You can enable or disable this feature in your account settings and customize the delivery time.
                </p>
              </div>

              {/* FAQ 5 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">How does the AI assistant work?</h3>
                <p className="text-gray-300">
                  The AI assistant analyzes your tasks and journal entries to answer questions and provide insights. It uses OpenAI's API to understand your queries and provide helpful responses. You can ask about your tasks, get recommendations, or request productivity tips.
                </p>
              </div>

              {/* FAQ 6 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">Is my data secure?</h3>
                <p className="text-gray-300">
                  Yes. All data is transmitted using HTTPS encryption and stored in secure cloud databases. We use industry-standard security practices to protect your information. See our <Link href="/privacy" className="text-accent hover:text-accent-light">Privacy Policy</Link> for details.
                </p>
              </div>

              {/* FAQ 7 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">Can I export my data?</h3>
                <p className="text-gray-300">
                  Yes! You can export all your tasks and journal entries at any time through the app's export feature in settings.
                </p>
              </div>

              {/* FAQ 8 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">How do I delete my account?</h3>
                <div className="text-gray-300">
                  <p className="mb-2">To delete your account and all associated data:</p>
                  <ol className="list-decimal pl-6 space-y-1 mb-3">
                    <li>Log into the app</li>
                    <li>Go to Settings</li>
                    <li>Scroll down to "Delete Account"</li>
                    <li>Confirm your decision</li>
                  </ol>
                  <p className="mb-2">All your data will be permanently deleted from our servers. This action cannot be undone.</p>
                  <p>
                    Alternatively, you can email us at <a href="mailto:todolist.notifications@gmail.com" className="text-accent hover:text-accent-light">todolist.notifications@gmail.com</a> to request account deletion.
                  </p>
                </div>
              </div>

              {/* FAQ 9 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">How do I leave a collaborative space?</h3>
                <p className="text-gray-300">
                  Open the space you want to leave, go to space settings, and click "Leave Space". Your personal data in other spaces will not be affected.
                </p>
              </div>

              {/* FAQ 10 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">What happens to AI-generated content?</h3>
                <p className="text-gray-300">
                  AI features (task categorization, summaries, assistant responses) are processed using OpenAI's API. Your data is sent to OpenAI for processing and is typically retained for 30 days according to their policies. See our <Link href="/privacy" className="text-accent hover:text-accent-light">Privacy Policy</Link> for more information.
                </p>
              </div>

              {/* FAQ 11 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">Is todolist.nyc free?</h3>
                <p className="text-gray-300">
                  Yes! todolist.nyc is currently free to use with all features included.
                </p>
              </div>

              {/* FAQ 12 */}
              <div className="border-b border-gray-800 pb-6">
                <h3 className="text-xl font-semibold text-gray-100 mb-2">Which platforms are supported?</h3>
                <div className="text-gray-300">
                  <p className="mb-2">todolist.nyc works on:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Web browsers (Chrome, Safari, Firefox, Edge)</li>
                    <li>iOS (via web app or native app)</li>
                    <li>Android (via web app - coming soon to Google Play)</li>
                  </ul>
                </div>
              </div>
            </div>

            <h2 className="text-3xl font-bold mt-12 mb-4 text-gray-100">Need More Help?</h2>
            <p className="mb-4 text-gray-300">
              If you can't find the answer to your question in our FAQ, please don't hesitate to contact us:
            </p>
            <p className="mb-4 text-gray-300">
              <strong className="text-gray-100">Email:</strong> <a href="mailto:todolist.notifications@gmail.com" className="text-accent hover:text-accent-light">todolist.notifications@gmail.com</a>
            </p>
            <p className="mb-2 text-gray-300">When contacting support, please include:</p>
            <ul className="list-disc pl-6 space-y-1 mb-6 text-gray-300">
              <li>A clear description of your issue or question</li>
              <li>Steps to reproduce the problem (if applicable)</li>
              <li>Your device/browser information (if relevant)</li>
              <li>Screenshots (if helpful)</li>
            </ul>

            <h2 className="text-3xl font-bold mt-12 mb-4 text-gray-100">Report Abuse</h2>
            <p className="mb-4 text-gray-300">
              If you experience harassment, inappropriate content, or abuse within collaborative spaces, please contact us immediately at <a href="mailto:todolist.notifications@gmail.com" className="text-accent hover:text-accent-light">todolist.notifications@gmail.com</a> with:
            </p>
            <ul className="list-disc pl-6 space-y-1 mb-6 text-gray-300">
              <li>Details of the incident</li>
              <li>Space name and involved users (if applicable)</li>
              <li>Screenshots or evidence (if available)</li>
            </ul>
            <p className="mb-6 text-gray-300">We take all reports seriously and will investigate promptly.</p>
          </div>

          <footer className="mt-12 pt-6 border-t border-gray-800 text-center text-gray-400">
            <p>
              <Link href="/home" className="text-accent hover:text-accent-light">Back to Home</Link>
              {' | '}
              <Link href="/privacy" className="text-accent hover:text-accent-light">Privacy Policy</Link>
              {' | '}
              <Link href="/terms" className="text-accent hover:text-accent-light">Terms of Service</Link>
            </p>
            <p className="mt-2">&copy; 2025 todolist.nyc. All rights reserved.</p>
          </footer>
        </div>
      </div>
    </>
  );
}
