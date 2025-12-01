import Head from 'next/head';
import Link from 'next/link';

export default function SupportPage() {
  return (
    <>
      <Head>
        <title>Support - todolist.nyc</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <Link href="/home" className="text-purple-600 hover:underline mb-8 inline-block">
            ← Back to Home
          </Link>

          <header className="border-b-2 border-purple-600 pb-6 mb-8">
            <h1 className="text-4xl font-bold text-purple-600 mb-2">Support</h1>
          </header>

          <div className="bg-purple-50 border-l-4 border-purple-600 p-6 rounded-lg mb-8">
            <h3 className="text-xl font-semibold text-purple-900 mb-2">Get in Touch</h3>
            <p className="text-purple-800">
              <strong>Email:</strong> <a href="mailto:todolist.notifications@gmail.com" className="text-purple-600 hover:underline">todolist.notifications@gmail.com</a>
            </p>
            <p className="text-purple-700 text-sm mt-2">We typically respond within 24-48 hours.</p>
          </div>

          <div className="prose max-w-none">
            <h2 className="text-3xl font-bold mt-8 mb-6">Frequently Asked Questions</h2>

            <div className="space-y-6">
              {/* FAQ 1 */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">How do I create an account?</h3>
                <p className="text-gray-600">
                  Simply enter your email address on the sign-up page. You'll receive a verification code via email to complete the registration process. No password required!
                </p>
              </div>

              {/* FAQ 2 */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">How do collaborative spaces work?</h3>
                <p className="text-gray-600">
                  Collaborative spaces allow you to share tasks and journals with team members or family. Create a new space, invite others by email, and all members can view and edit shared content. Each user also has a personal "Default" space for private tasks.
                </p>
              </div>

              {/* FAQ 3 */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Does the app work offline?</h3>
                <p className="text-gray-600">
                  Yes! todolist.nyc is a Progressive Web App (PWA) that works offline. Your tasks and journals are stored locally on your device and automatically sync when you're back online. You can add, edit, and complete tasks even without an internet connection.
                </p>
              </div>

              {/* FAQ 4 */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">What are email summaries?</h3>
                <p className="text-gray-600">
                  Email summaries are AI-generated daily or weekly summaries of your tasks and progress. You can enable or disable this feature in your account settings and customize the delivery time.
                </p>
              </div>

              {/* FAQ 5 */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">How does the AI assistant work?</h3>
                <p className="text-gray-600">
                  The AI assistant analyzes your tasks and journal entries to answer questions and provide insights. It uses OpenAI's API to understand your queries and provide helpful responses. You can ask about your tasks, get recommendations, or request productivity tips.
                </p>
              </div>

              {/* FAQ 6 */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Is my data secure?</h3>
                <p className="text-gray-600">
                  Yes. All data is transmitted using HTTPS encryption and stored in secure cloud databases. We use industry-standard security practices to protect your information. See our <Link href="/privacy" className="text-purple-600 hover:underline">Privacy Policy</Link> for details.
                </p>
              </div>

              {/* FAQ 7 */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Can I export my data?</h3>
                <p className="text-gray-600">
                  Yes! You can export all your tasks and journal entries at any time through the app's export feature in settings.
                </p>
              </div>

              {/* FAQ 8 */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">How do I delete my account?</h3>
                <div className="text-gray-600">
                  <p className="mb-2">To delete your account and all associated data:</p>
                  <ol className="list-decimal pl-6 space-y-1 mb-3">
                    <li>Log into the app</li>
                    <li>Go to Settings</li>
                    <li>Scroll down to "Delete Account"</li>
                    <li>Confirm your decision</li>
                  </ol>
                  <p className="mb-2">All your data will be permanently deleted from our servers. This action cannot be undone.</p>
                  <p>
                    Alternatively, you can email us at <a href="mailto:todolist.notifications@gmail.com" className="text-purple-600 hover:underline">todolist.notifications@gmail.com</a> to request account deletion.
                  </p>
                </div>
              </div>

              {/* FAQ 9 */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">How do I leave a collaborative space?</h3>
                <p className="text-gray-600">
                  Open the space you want to leave, go to space settings, and click "Leave Space". Your personal data in other spaces will not be affected.
                </p>
              </div>

              {/* FAQ 10 */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">What happens to AI-generated content?</h3>
                <p className="text-gray-600">
                  AI features (task categorization, summaries, assistant responses) are processed using OpenAI's API. Your data is sent to OpenAI for processing and is typically retained for 30 days according to their policies. See our <Link href="/privacy" className="text-purple-600 hover:underline">Privacy Policy</Link> for more information.
                </p>
              </div>

              {/* FAQ 11 */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Is todolist.nyc free?</h3>
                <p className="text-gray-600">
                  Yes! todolist.nyc is currently free to use with all features included.
                </p>
              </div>

              {/* FAQ 12 */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Which platforms are supported?</h3>
                <div className="text-gray-600">
                  <p className="mb-2">todolist.nyc works on:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Web browsers (Chrome, Safari, Firefox, Edge)</li>
                    <li>iOS (via web app or native app)</li>
                    <li>Android (via web app - coming soon to Google Play)</li>
                  </ul>
                </div>
              </div>
            </div>

            <h2 className="text-3xl font-bold mt-12 mb-4">Need More Help?</h2>
            <p className="mb-4">
              If you can't find the answer to your question in our FAQ, please don't hesitate to contact us:
            </p>
            <p className="mb-4">
              <strong>Email:</strong> <a href="mailto:todolist.notifications@gmail.com" className="text-purple-600 hover:underline">todolist.notifications@gmail.com</a>
            </p>
            <p className="mb-2">When contacting support, please include:</p>
            <ul className="list-disc pl-6 space-y-1 mb-6">
              <li>A clear description of your issue or question</li>
              <li>Steps to reproduce the problem (if applicable)</li>
              <li>Your device/browser information (if relevant)</li>
              <li>Screenshots (if helpful)</li>
            </ul>

            <h2 className="text-3xl font-bold mt-12 mb-4">Report Abuse</h2>
            <p className="mb-4">
              If you experience harassment, inappropriate content, or abuse within collaborative spaces, please contact us immediately at <a href="mailto:todolist.notifications@gmail.com" className="text-purple-600 hover:underline">todolist.notifications@gmail.com</a> with:
            </p>
            <ul className="list-disc pl-6 space-y-1 mb-6">
              <li>Details of the incident</li>
              <li>Space name and involved users (if applicable)</li>
              <li>Screenshots or evidence (if available)</li>
            </ul>
            <p className="mb-6">We take all reports seriously and will investigate promptly.</p>
          </div>

          <footer className="mt-12 pt-6 border-t border-gray-200 text-center text-gray-600">
            <p>
              <Link href="/home" className="text-purple-600 hover:underline">Back to Home</Link>
              {' | '}
              <Link href="/privacy" className="text-purple-600 hover:underline">Privacy Policy</Link>
              {' | '}
              <Link href="/terms" className="text-purple-600 hover:underline">Terms of Service</Link>
            </p>
            <p className="mt-2">&copy; 2025 todolist.nyc. All rights reserved.</p>
          </footer>
        </div>
      </div>
    </>
  );
}
