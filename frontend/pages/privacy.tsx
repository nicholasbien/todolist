import Head from 'next/head';
import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <>
      <Head>
        <title>Privacy Policy - todolist.nyc</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <Link href="/home" className="text-purple-600 hover:underline mb-8 inline-block">
            ← Back to Home
          </Link>

          <header className="border-b-2 border-purple-600 pb-6 mb-8">
            <h1 className="text-4xl font-bold text-purple-600 mb-2">Privacy Policy</h1>
            <p className="text-gray-600">Last updated: December 2024</p>
          </header>

          <div className="prose max-w-none">
            <p className="text-lg mb-6">
              At todolist.nyc, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our application.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4">1. Information We Collect</h2>

            <h3 className="text-xl font-semibold mt-6 mb-3">1.1 Information You Provide</h3>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Email Address:</strong> Used for account authentication and login verification codes</li>
              <li><strong>Tasks and To-Do Items:</strong> The tasks you create, including text, categories, priorities, and completion status</li>
              <li><strong>Journal Entries:</strong> Any journal content you create within the app</li>
              <li><strong>Workspace Data:</strong> Information about collaborative spaces you create or join</li>
              <li><strong>AI Queries:</strong> Questions or prompts you send to the AI assistant feature</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-3">1.2 Automatically Collected Information</h3>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Usage Data:</strong> Information about how you interact with the app (stored locally for offline functionality)</li>
              <li><strong>Device Information:</strong> Basic device and browser information for app functionality</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Account Management:</strong> To create and manage your account, authenticate logins via email verification codes</li>
              <li><strong>Core Functionality:</strong> To provide task management, collaborative spaces, and offline sync capabilities</li>
              <li><strong>AI Features:</strong> Automatic task categorization, generate email summaries, provide AI assistant responses</li>
              <li><strong>Communication:</strong> To send verification codes, email summaries (if enabled), and important service updates</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4">3. Third-Party Services</h2>

            <h3 className="text-xl font-semibold mt-6 mb-3">3.1 OpenAI API</h3>
            <p className="mb-4">
              We use OpenAI's API to provide AI-powered features. When you use these features, the following data may be sent to OpenAI:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Task text content (for automatic categorization)</li>
              <li>Journal entries (for email summaries and AI assistant context)</li>
              <li>User queries submitted to the AI assistant</li>
            </ul>
            <p className="mb-4">
              <strong>Purpose:</strong> To provide task categorization, generate email summaries, and respond to AI assistant queries.<br />
              <strong>Data Retention:</strong> OpenAI may retain this data according to their data retention policies (typically 30 days for API requests). Learn more at <a href="https://openai.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">OpenAI Privacy Policy</a>.
            </p>

            <h3 className="text-xl font-semibold mt-6 mb-3">3.2 Email Service & Database</h3>
            <p className="mb-4">
              We use SMTP services to send verification codes and optional email summaries. Your data is stored in a secure MongoDB cloud database.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4">4. Data Storage and Security</h2>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Encryption:</strong> All data transmitted between your device and our servers uses HTTPS encryption</li>
              <li><strong>Secure Storage:</strong> Your data is stored in secure, encrypted cloud databases</li>
              <li><strong>Offline Storage:</strong> The app stores data locally on your device using IndexedDB for offline functionality</li>
              <li><strong>Authentication:</strong> We use JWT (JSON Web Token) based authentication to secure your account</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4">5. Data Sharing and Disclosure</h2>
            <p className="mb-4">
              We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>With Your Consent:</strong> When you explicitly invite others to collaborative spaces</li>
              <li><strong>Service Providers:</strong> With third-party services (OpenAI, email providers) as described above</li>
              <li><strong>Legal Requirements:</strong> If required by law, court order, or government regulation</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4">6. Collaborative Spaces</h2>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Tasks and data within a space are visible to all members of that space</li>
              <li>Space owners can invite new members by email</li>
              <li>You can leave a space at any time</li>
              <li>Your personal spaces and data remain private unless explicitly shared</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4">7. Your Rights and Choices</h2>

            <h3 className="text-xl font-semibold mt-6 mb-3">7.1 Access and Update</h3>
            <p className="mb-4">
              You can access and update your information at any time through the app settings.
            </p>

            <h3 className="text-xl font-semibold mt-6 mb-3">7.2 Email Summaries</h3>
            <p className="mb-4">
              You can enable or disable email summaries in your account settings. This is entirely optional.
            </p>

            <h3 className="text-xl font-semibold mt-6 mb-3">7.3 Data Deletion</h3>
            <p className="mb-4">
              You have the right to delete your account and all associated data at any time:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Log into the app</li>
              <li>Go to Settings</li>
              <li>Select "Delete Account"</li>
              <li>Or contact us at <a href="mailto:todolist.notifications@gmail.com" className="text-purple-600 hover:underline">todolist.notifications@gmail.com</a></li>
            </ul>
            <p className="mb-4">
              Upon account deletion, we will permanently delete all your data from our servers.
            </p>

            <h3 className="text-xl font-semibold mt-6 mb-3">7.4 Export Your Data</h3>
            <p className="mb-4">
              You can export your data at any time through the app's export feature.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4">8. Children's Privacy</h2>
            <p className="mb-4">
              Our service is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4">9. Changes to This Privacy Policy</h2>
            <p className="mb-4">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4">10. Contact Us</h2>
            <p className="mb-4">
              If you have any questions or concerns about this Privacy Policy or our data practices, please contact us:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Email:</strong> <a href="mailto:todolist.notifications@gmail.com" className="text-purple-600 hover:underline">todolist.notifications@gmail.com</a></li>
              <li><strong>Website:</strong> <a href="https://todolist.nyc" className="text-purple-600 hover:underline">todolist.nyc</a></li>
            </ul>
          </div>

          <footer className="mt-12 pt-6 border-t border-gray-200 text-center text-gray-600">
            <p>
              <Link href="/home" className="text-purple-600 hover:underline">Back to Home</Link>
              {' | '}
              <Link href="/terms" className="text-purple-600 hover:underline">Terms of Service</Link>
              {' | '}
              <Link href="/support" className="text-purple-600 hover:underline">Support</Link>
            </p>
            <p className="mt-2">&copy; 2025 todolist.nyc. All rights reserved.</p>
          </footer>
        </div>
      </div>
    </>
  );
}
