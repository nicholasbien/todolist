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

    // Convert markdown links [text](url) first
    escapedText = escapedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">${text}</a>`;
    });

    // Then convert standalone URLs to clickable links (but not if they're already in an anchor tag)
    // Use negative lookbehind to avoid URLs that are part of href attributes
    const urlRegex = /(?<!href="|href=')(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
    escapedText = escapedText.replace(urlRegex, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline break-all">${url}</a>`;
    });

    // Convert headers (#, ##, ###, ####) - balanced spacing now that <br> is removed
    escapedText = escapedText.replace(/^#### (.+)$/gm, '<h4 class="text-lg font-semibold mt-3 mb-2">$1</h4>');
    escapedText = escapedText.replace(/^### (.+)$/gm, '<h3 class="text-xl font-semibold mt-3 mb-2">$1</h3>');
    escapedText = escapedText.replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold mt-4 mb-2">$1</h2>');
    escapedText = escapedText.replace(/^# (.+)$/gm, '<h1 class="text-3xl font-bold mt-4 mb-3">$1</h1>');

    // Convert **bold** markdown to HTML (must be before single *)
    escapedText = escapedText.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');

    // Convert numbered lists (1. 2. 3.)
    escapedText = escapedText.replace(/^(\d+)\.\s+(.+)$/gm, '<li class="ml-6 list-decimal">$2</li>');

    // Convert bullet lists (- or *)
    escapedText = escapedText.replace(/^[-*]\s+(.+)$/gm, '<li class="ml-6 list-disc">$1</li>');

    // Wrap consecutive list items in <ul> or <ol> - proper spacing without <br> tags
    escapedText = escapedText.replace(/(<li class="ml-6 list-disc">.*?<\/li>(\s*<br>)?)+/g, (match) => {
      return `<ul class="my-2 space-y-1">${match.replace(/<br>/g, '')}</ul>`;
    });
    escapedText = escapedText.replace(/(<li class="ml-6 list-decimal">.*?<\/li>(\s*<br>)?)+/g, (match) => {
      return `<ol class="my-2 space-y-1">${match.replace(/<br>/g, '')}</ol>`;
    });

    // Convert *italic* markdown to HTML (more specific to avoid conflicts)
    // Match single asterisks that aren't at line start and have non-whitespace content
    escapedText = escapedText.replace(/(?<!^|\n|\*)\*([^*\n]+)\*(?!\*)/g, '<em class="italic">$1</em>');

    // Convert code blocks ``` first (must be before inline code) - with horizontal scroll
    escapedText = escapedText.replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-800 p-3 rounded my-2 overflow-x-auto"><code class="text-sm font-mono">$1</code></pre>');

    // Convert `code` markdown to HTML (after code blocks)
    escapedText = escapedText.replace(/`([^`\n]+)`/g, '<code class="bg-gray-700 px-1 py-0.5 rounded text-sm font-mono">$1</code>');

    // Convert horizontal rules (---)
    escapedText = escapedText.replace(/^---$/gm, '<hr class="my-3 border-gray-600">');

    // Convert blockquotes (>) - must be before line breaks
    escapedText = escapedText.replace(/^>\s*(.+)$/gm, '<blockquote class="border-l-4 border-gray-500 pl-4 py-1 my-2 italic text-gray-300">$1</blockquote>');

    // Convert tables - simple markdown table support
    // First identify table rows with pipes
    const tableRegex = /^\|(.+)\|$/gm;
    const tables: string[] = [];
    let tableMatch;

    // Collect all potential table rows
    escapedText = escapedText.replace(/((^\|.+\|$\n?)+)/gm, (match) => {
      const lines = match.trim().split('\n');
      if (lines.length >= 2) {
        let tableHtml = '<div class="overflow-x-auto my-2"><table class="border-collapse border border-gray-600">';

        lines.forEach((line, index) => {
          const cells = line.split('|').filter(cell => cell.trim());
          const isHeader = index === 0;
          const isSeparator = cells.every(cell => /^[-:\s]+$/.test(cell));

          if (!isSeparator) {
            tableHtml += '<tr>';
            cells.forEach(cell => {
              const tag = isHeader ? 'th' : 'td';
              const classes = isHeader
                ? 'border border-gray-600 px-3 py-1 bg-gray-700 font-semibold'
                : 'border border-gray-600 px-3 py-1';
              tableHtml += `<${tag} class="${classes}">${cell.trim()}</${tag}>`;
            });
            tableHtml += '</tr>';
          }
        });

        tableHtml += '</table></div>';
        return tableHtml;
      }
      return match;
    });

    // Don't convert single newlines to <br> - let block elements handle their own spacing
    // Only convert double newlines to paragraph breaks
    escapedText = escapedText.replace(/\n\n+/g, '</p><p class="mt-2">')
    // Wrap in paragraph tags if not already wrapped
    if (!escapedText.startsWith('<')) {
      escapedText = `<p>${escapedText}</p>`;
    }

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
