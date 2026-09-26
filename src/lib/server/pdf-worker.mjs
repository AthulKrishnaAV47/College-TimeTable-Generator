// Isolated process: hard wall-clock cancellation + memory cap from parent.
import { getDocumentProxy, extractText, extractTextItems } from 'unpdf';
process.once('message', async ({ base64, kind }) => {
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, 'base64')));
    if (pdf.numPages > 100) throw new Error('Too many pages');
    if (kind === 'eligibility') {
      const { text } = await extractText(pdf, { mergePages: true });
      if (text.length > 1_000_000) throw new Error('Too much text');
      process.send?.({ text });
    } else {
      const { items } = await extractTextItems(pdf);
      if (JSON.stringify(items).length > 15_000_000) throw new Error('Too many items');
      process.send?.({ items });
    }
  } catch { process.send?.({ error: true }); }
  finally { await pdf?.destroy(); process.disconnect(); }
});
