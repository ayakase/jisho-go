import { createWorker } from "tesseract.js";
const worker = await createWorker("jpn", 1, {
  logger: (m) => console.log(m), // Add logger here
});
(async () => {
  const {
    data: { text },
  } = await worker.recognize("./image copy 2.png");

  const onlyJapanese = text.replace(
    /[^\u3040-\u30FF\u4E00-\u9FFF。、・！？ー ]/g,
    ""
  );
  console.log(onlyJapanese);
  await worker.terminate();
})();
