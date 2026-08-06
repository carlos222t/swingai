/* Serves the same window.SwingAI.config that js/config.js provides locally,
   but reads the key from a Vercel environment variable instead of a
   gitignored file (which never makes it to a deployment). vercel.json
   rewrites /js/config.js to this function in production; locally, npx serve
   just finds the real js/config.js file on disk instead, so this endpoint
   is only ever hit on Vercel. */
module.exports = (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.status(200).send(
    `window.SwingAI = window.SwingAI || {};\nwindow.SwingAI.config = ${JSON.stringify({
      TWELVE_DATA_KEY: process.env.TWELVE_DATA_KEY || ""
    })};`
  );
};
