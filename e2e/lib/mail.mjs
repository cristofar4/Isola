// Local SMTP server that captures messages for tests. Start the app with
// SMTP_URL=smtp://127.0.0.1:2525 (or SMTP_TEST_PORT) so its email lands here.
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";

export async function startMailbox(port = Number(process.env.SMTP_TEST_PORT || 2525)) {
  const messages = [];
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    logger: false,
    onData(stream, _session, callback) {
      simpleParser(stream)
        .then((mail) => messages.push({ to: mail.to?.text ?? "", subject: mail.subject ?? "", text: mail.text ?? "", html: mail.html || "" }))
        .then(() => callback(), callback);
    },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    messages,
    /** Resolves with the nth (1-based) message to `to` whose subject matches, or null on timeout. */
    async waitFor(to, subject = /./, nth = 1, timeout = 15000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const mine = messages.filter((m) => m.to.includes(to) && subject.test(m.subject));
        if (mine.length >= nth) return mine[nth - 1];
        await new Promise((r) => setTimeout(r, 150));
      }
      return null;
    },
    count(to, subject = /./) {
      return messages.filter((m) => m.to.includes(to) && subject.test(m.subject)).length;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export function linkIn(mail, path) {
  const match = mail?.text.match(new RegExp(`https?://\\S+${path.replace(/[/]/g, "\\/")}\\S*`));
  return match ? match[0] : null;
}
