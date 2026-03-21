/** Default BlockNote document content for new notes. */
export const DEFAULT_BLOCKS = [
  {
    type: "heading",
    content: "Welcome to Scripta",
    props: { level: 1 } as Record<string, unknown>,
  },
  {
    type: "paragraph",
    content: "The note app for everyone. Start typing here...",
  },
];

/** JSON-serialized form of {@link DEFAULT_BLOCKS} for API calls. */
export const DEFAULT_CONTENT = JSON.stringify(DEFAULT_BLOCKS);
