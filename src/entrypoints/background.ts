export default defineBackground(() => {
  // create a menu item once the extension gets installed or loads
  browser.contextMenus.create({
    id: "capture-selection",
    title: "Capture Selection",
    contexts: ["page"], // show on page right‑click
  });

  // listen for menu item clicks
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "capture-selection" && tab?.id) {
      browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          window.postMessage({ type: "START_SELECTION" }, "*");
        },
      });
    }
  });
});
