// Short pieces are merged into the next one: a lone "OK." or a one-word
// question is what the chat-style voice model is most tempted to reply to
// instead of reading.
const MIN_PIECE_CHARS = 25;
const MAX_PIECES = 8;

// Splits an answer into sentence-sized pieces so each can be voiced in
// parallel and the first one played while the rest are still generating.
export function splitIntoSpokenPieces(text: string) {
  const sentences = text.match(/[^។?!.\n]+[។?!.]*/g)?.map((part) => part.trim()).filter(Boolean) ?? [text];
  const pieces: string[] = [];
  let carry = "";
  for (const sentence of sentences) {
    carry = carry ? `${carry} ${sentence}` : sentence;
    if (carry.length >= MIN_PIECE_CHARS) {
      pieces.push(carry);
      carry = "";
    }
  }
  if (carry) {
    if (pieces.length) pieces[pieces.length - 1] = `${pieces[pieces.length - 1]} ${carry}`;
    else pieces.push(carry);
  }
  while (pieces.length > MAX_PIECES) {
    const last = pieces.pop()!;
    pieces[pieces.length - 1] = `${pieces[pieces.length - 1]} ${last}`;
  }
  return pieces;
}
