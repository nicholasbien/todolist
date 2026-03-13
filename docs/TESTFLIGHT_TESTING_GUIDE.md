TESTFLIGHT BETA TESTING GUIDE

Thanks for helping test AI Todo List! This guide will help you test all the key features.

GETTING STARTED:
- Sign up with your email address
- Check your email for a verification code (6 digits)
- Enter the code to log in
- Start adding tasks!


WHAT TO TEST:

1. AI Task Classification
   - Add tasks with different contexts:
     * "Buy groceries at Whole Foods"
     * "Team standup meeting at 3pm"
     * "Call dentist to schedule cleaning"
     * "Read Python documentation"
   - Verify tasks are auto-categorized (Shopping, Work, Personal, Learning, etc.)
   - Check that categories appear and tasks are grouped correctly

2. Offline Functionality (CRITICAL - Please Test!)
   - Turn on airplane mode
   - Add several new tasks
   - Edit existing tasks
   - Mark tasks as complete
   - Turn off airplane mode
   - Verify all changes sync automatically
   - Check that no data was lost

3. AI Assistant
   - Tap the chat icon to open the AI Assistant
   - Try these queries:
     * "What are my tasks?"
     * "Add task to learn Swift programming"
     * "What's the weather in [your city]?"
   - Verify responses are relevant and tasks are actually created

4. Journal Entries
   - Tap the journal icon
   - Add a journal entry for today
   - Switch to a different date
   - Verify entries save automatically
   - Test offline: add entry in airplane mode, verify it syncs when back online

5. Task Management
   - Create tasks with different priorities (tap the priority button)
   - Mark tasks as complete/incomplete
   - Edit task text
   - Delete tasks
   - Verify all actions work smoothly

6. Email Summaries
   - Go to Settings (tap your profile/settings icon)
   - Enable daily email summaries
   - Set your preferred time for receiving summaries
   - Add some tasks and complete a few
   - Wait for the next scheduled email (or request a test summary if available)
   - Check that the email arrives and contains:
     * Today's completed tasks
     * Pending tasks grouped by priority
     * AI-generated insights about your productivity
   - Verify the summary is helpful and accurate

7. iOS-Specific Testing
   - Test on different iPhone models if possible (especially notched models)
   - Check that header doesn't overlap with status bar/notch
   - Verify app works in both portrait and landscape
   - Test with Dynamic Island (iPhone 14 Pro and newer)
   - Check dark mode appearance


AREAS WE ESPECIALLY NEED FEEDBACK ON:

- Does offline sync work reliably? Any lost data?
- Is the AI classification accurate for your tasks?
- Any UI issues on your specific iPhone model?
- Is the app responsive and fast?
- Any crashes or freezes?


KNOWN LIMITATIONS:

- First AI response may be slow (2-3 seconds)
- Email verification codes may take 1-2 minutes to arrive


HOW TO REPORT ISSUES:

Please report bugs or feedback including:
1. What you were trying to do
2. What happened vs what you expected
3. Your iPhone model and iOS version
4. Steps to reproduce (if possible)

You can send feedback:
- Through TestFlight's built-in feedback feature
- Directly through the app's contact form (tap Settings → Contact)
- Or reach out to me directly


Thanks for testing! Your feedback helps make this app better.
