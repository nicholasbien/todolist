import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageRendererProps {
  content: string;
  className?: string;
}

/**
 * Renders agent messages using react-markdown for proper markdown support
 */
export const MessageRenderer: React.FC<MessageRendererProps> = ({ content, className = '' }) => {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Links
          a: ({ node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline break-all"
            />
          ),
          // Headers
          h1: ({ node, ...props }) => <h1 {...props} className="text-3xl font-bold mt-4 mb-3" />,
          h2: ({ node, ...props }) => <h2 {...props} className="text-2xl font-bold mt-4 mb-2" />,
          h3: ({ node, ...props }) => <h3 {...props} className="text-xl font-semibold mt-3 mb-2" />,
          h4: ({ node, ...props }) => <h4 {...props} className="text-lg font-semibold mt-3 mb-2" />,
          // Lists
          ul: ({ node, ...props }) => <ul {...props} className="ml-6 my-2 list-disc space-y-1" />,
          ol: ({ node, ...props }) => <ol {...props} className="ml-6 my-2 list-decimal space-y-1" />,
          li: ({ node, ...props }) => <li {...props} className="ml-0" />,
          // Code
          code: ({ node, inline, ...props }) =>
            inline ? (
              <code {...props} className="bg-gray-700 px-1 py-0.5 rounded text-sm font-mono" />
            ) : (
              <code {...props} className="text-sm font-mono" />
            ),
          pre: ({ node, ...props }) => (
            <pre {...props} className="bg-gray-800 p-3 rounded my-3 overflow-x-auto" />
          ),
          // Emphasis
          strong: ({ node, ...props }) => <strong {...props} className="font-semibold" />,
          em: ({ node, ...props }) => <em {...props} className="italic" />,
          // Blockquote
          blockquote: ({ node, ...props }) => (
            <blockquote
              {...props}
              className="border-l-4 border-gray-500 pl-4 py-2 my-3 italic text-gray-300"
            />
          ),
          // Horizontal rule
          hr: ({ node, ...props }) => <hr {...props} className="my-4 border-gray-600" />,
          // Tables
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-3">
              <table {...props} className="border-collapse border border-gray-600" />
            </div>
          ),
          thead: ({ node, ...props }) => <thead {...props} />,
          tbody: ({ node, ...props }) => <tbody {...props} />,
          tr: ({ node, ...props }) => <tr {...props} />,
          th: ({ node, ...props }) => (
            <th {...props} className="border border-gray-600 px-3 py-1 bg-gray-700 font-semibold" />
          ),
          td: ({ node, ...props }) => <td {...props} className="border border-gray-600 px-3 py-1" />,
          // Paragraphs
          p: ({ node, ...props }) => <p {...props} className="my-2" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
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
