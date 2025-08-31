import React from 'react';

interface MessageRendererProps {
  content: string;
  className?: string;
}

/**
 * Safely renders agent messages with support for:
 * - Clickable URLs
 * - Basic HTML formatting from search results
 * - Preserves whitespace and line breaks
 */
export const MessageRenderer: React.FC<MessageRendererProps> = ({ content, className = '' }) => {
  const renderContent = (text: string) => {
    // First, escape any potential XSS by creating a text node
    const div = document.createElement('div');
    div.textContent = text;
    let escapedText = div.innerHTML;

    // Convert URLs to clickable links
    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
    escapedText = escapedText.replace(urlRegex, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline break-all">${url}</a>`;
    });

    // Convert **bold** markdown to HTML
    escapedText = escapedText.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');

    // Convert *italic* markdown to HTML
    escapedText = escapedText.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');

    // Convert `code` markdown to HTML
    escapedText = escapedText.replace(/`([^`]+)`/g, '<code class="bg-gray-700 px-1 py-0.5 rounded text-sm font-mono">$1</code>');

    // Convert newlines to <br> tags for proper line breaks
    escapedText = escapedText.replace(/\n/g, '<br>');

    return escapedText;
  };

  // For agent messages, we want to render HTML safely
  const renderedContent = renderContent(content);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  );
};

/**
 * Simple text renderer for user messages and tool data
 * Preserves whitespace without HTML rendering
 */
export const PlainTextRenderer: React.FC<MessageRendererProps> = ({ content, className = '' }) => {
  return (
    <div className={`whitespace-pre-wrap ${className}`}>
      {content}
    </div>
  );
};
