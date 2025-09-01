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

    // Convert headers (##, ###, ####)
    escapedText = escapedText.replace(/^#### (.+)$/gm, '<h4 class="text-lg font-semibold mt-3 mb-1">$1</h4>');
    escapedText = escapedText.replace(/^### (.+)$/gm, '<h3 class="text-xl font-semibold mt-3 mb-2">$1</h3>');
    escapedText = escapedText.replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold mt-4 mb-2">$1</h2>');

    // Convert **bold** markdown to HTML (must be before single *)
    escapedText = escapedText.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');

    // Convert numbered lists (1. 2. 3.)
    escapedText = escapedText.replace(/^(\d+)\.\s+(.+)$/gm, '<li class="ml-6 list-decimal">$2</li>');

    // Convert bullet lists (- or *)
    escapedText = escapedText.replace(/^[-*]\s+(.+)$/gm, '<li class="ml-6 list-disc">$2</li>');

    // Wrap consecutive list items in <ul> or <ol>
    escapedText = escapedText.replace(/(<li class="ml-6 list-disc">.*?<\/li>(\s*<br>)?)+/g, (match) => {
      return `<ul class="my-2">${match.replace(/<br>/g, '')}</ul>`;
    });
    escapedText = escapedText.replace(/(<li class="ml-6 list-decimal">.*?<\/li>(\s*<br>)?)+/g, (match) => {
      return `<ol class="my-2">${match.replace(/<br>/g, '')}</ol>`;
    });

    // Convert *italic* markdown to HTML (after lists to avoid conflicts)
    escapedText = escapedText.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');

    // Convert `code` markdown to HTML
    escapedText = escapedText.replace(/`([^`]+)`/g, '<code class="bg-gray-700 px-1 py-0.5 rounded text-sm font-mono">$1</code>');

    // Convert code blocks ```
    escapedText = escapedText.replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-800 p-3 rounded my-2 overflow-x-auto"><code class="text-sm font-mono">$1</code></pre>');

    // Convert horizontal rules (---)
    escapedText = escapedText.replace(/^---$/gm, '<hr class="my-4 border-gray-600">');

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
