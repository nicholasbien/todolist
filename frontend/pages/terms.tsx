import Head from 'next/head';
import Link from 'next/link';

export default function TermsPage() {
  return (
    <>
      <Head>
        <title>Terms of Service - todolist.nyc</title>
      </Head>

      <div className="min-h-screen bg-zinc-950">
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
              Welcome to todolist.nyc. By accessing or using our service, you agree to be bound by these Terms of Service ("Terms"). Please read them carefully.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">1. Acceptance of Terms</h2>
            <p className="mb-4 text-gray-300">
              By creating an account or using todolist.nyc, you agree to these Terms and our <Link href="/privacy" className="text-accent hover:text-accent-light">Privacy Policy</Link>. If you do not agree, please do not use our service.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">2. Description of Service</h2>
            <p className="mb-4 text-gray-300">todolist.nyc provides an AI-powered task management application with:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li>Task creation, organization, and management</li>
              <li>AI-powered automatic task categorization</li>
              <li>Collaborative workspaces for teams and groups</li>
              <li>Journal entries and note-taking</li>
              <li>AI assistant for task-related queries</li>
              <li>Optional email summaries of tasks and progress</li>
              <li>Offline-first progressive web app functionality</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">3. Account Registration and Security</h2>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li>You must provide a valid email address to create an account</li>
              <li>You are responsible for maintaining the confidentiality of your account</li>
              <li>You agree to provide accurate and complete information</li>
              <li>One person or legal entity may maintain only one account</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">4. Acceptable Use Policy</h2>
            <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">You Agree NOT to:</h3>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li>Use the service for any illegal purpose or in violation of any laws</li>
              <li>Share, store, or transmit any content that is illegal, harmful, threatening, abusive, or hateful</li>
              <li>Infringe on intellectual property rights</li>
              <li>Attempt to gain unauthorized access to the service or other users' accounts</li>
              <li>Interfere with or disrupt the service or servers</li>
              <li>Use automated means to access the service without permission</li>
              <li>Harass, abuse, or harm other users</li>
              <li>Use the service to send spam or unsolicited communications</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">Collaborative Spaces:</h3>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li>Respect other members of shared spaces</li>
              <li>Only invite individuals who have consented to join</li>
              <li>Do not share spaces for illegal or harmful purposes</li>
              <li>Space owners are responsible for managing their members</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">5. Content Ownership and License</h2>
            <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">Your Content:</h3>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li>You retain all rights to the content you create (tasks, journals, notes)</li>
              <li>You grant us a limited license to host, store, and process your content to provide the service</li>
              <li>This license includes using your content for AI features (categorization, summaries, assistant responses)</li>
            </ul>

            <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">Our Content:</h3>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li>The service, including software, design, and features, is owned by todolist.nyc</li>
              <li>You may not copy, modify, or create derivative works without permission</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">6. AI Features and Third-Party Services</h2>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li>AI features use OpenAI's API to process your content</li>
              <li>AI-generated categorizations and responses are automated and may not always be accurate</li>
              <li>You acknowledge that AI processing involves sending your content to third-party services</li>
              <li>See our <Link href="/privacy" className="text-accent hover:text-accent-light">Privacy Policy</Link> for details on data sharing</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">7. Service Availability and Modifications</h2>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li>We strive for high availability but do not guarantee uninterrupted access</li>
              <li>The service may be unavailable due to maintenance, updates, or technical issues</li>
              <li>We may modify, suspend, or discontinue any part of the service at any time</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">8. Termination</h2>
            <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">Your Right to Terminate:</h3>
            <p className="mb-4 text-gray-300">
              You may delete your account at any time through the app settings. Upon deletion, your data will be permanently removed from our servers.
            </p>

            <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-200">Our Right to Terminate:</h3>
            <p className="mb-4 text-gray-300">We may suspend or terminate your account if you:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li>Violate these Terms of Service</li>
              <li>Engage in fraudulent or illegal activity</li>
              <li>Abuse or harass other users</li>
              <li>Use the service in a manner that harms others or the service</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">9. Disclaimer of Warranties</h2>
            <p className="mb-4 text-gray-300">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">10. Limitation of Liability</h2>
            <p className="mb-4 text-gray-300">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, todolist.nyc SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, LOSS OF PROFITS, DATA, USE, OR OTHER INTANGIBLE LOSSES.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">11. Data Backup and Export</h2>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li>You are responsible for maintaining your own backups of your content</li>
              <li>We provide export functionality to help you backup your data</li>
              <li>We are not responsible for data loss due to service issues or account termination</li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">12. Governing Law</h2>
            <p className="mb-4 text-gray-300">
              These Terms shall be governed by the laws of the State of New York, United States, without regard to conflict of law provisions.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">13. Changes to Terms</h2>
            <p className="mb-4 text-gray-300">
              We may modify these Terms at any time. We will notify you of material changes via email or in-app notification. Continued use after changes constitutes acceptance.
            </p>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">14. Contact Information</h2>
            <p className="mb-4 text-gray-300">If you have questions about these Terms, please contact us:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-gray-300">
              <li><strong className="text-gray-100">Email:</strong> <a href="mailto:todolist.notifications@gmail.com" className="text-accent hover:text-accent-light">todolist.notifications@gmail.com</a></li>
              <li><strong className="text-gray-100">Website:</strong> <a href="https://todolist.nyc" className="text-accent hover:text-accent-light">todolist.nyc</a></li>
            </ul>

            <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-100">15. Acknowledgment</h2>
            <p className="mb-4 text-gray-300">
              By using todolist.nyc, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
            </p>
          </div>

          <footer className="mt-12 pt-6 border-t border-gray-800 text-center text-gray-400">
            <p>
              <Link href="/home" className="text-accent hover:text-accent-light">Back to Home</Link>
              {' | '}
              <Link href="/privacy" className="text-accent hover:text-accent-light">Privacy Policy</Link>
              {' | '}
              <Link href="/support" className="text-accent hover:text-accent-light">Support</Link>
            </p>
            <p className="mt-2">&copy; 2025 todolist.nyc. All rights reserved.</p>
          </footer>
        </div>
      </div>
    </>
  );
}
