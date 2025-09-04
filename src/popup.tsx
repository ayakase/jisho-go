import "~style.css"
import React, { useState } from "react";

function IndexPopup() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  const fetchDefinition = async () => {
    if (!query) return;
    try {
      const res = await fetch(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.data || []);
    } catch (err) {
      setResults([]);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchDefinition();
  };

  return (
    <div className=" plasmo-h-96 plasmo-w-96">
       <div className="plasmo-flex plasmo-flex-col plasmo-items-center plasmo-justify-center plasmo-bg-gray-100 plasmo-p-4">
      <h1 className="plasmo-text-3xl plasmo-font-bold plasmo-mb-6">Japanese Dictionary</h1>

      <form onSubmit={handleSearch} className="plasmo-flex plasmo-gap-2 plasmo-mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter kanji or word"
          className="plasmo-border plasmo-border-gray-300 plasmo-rounded plasmo-px-3 plasmo-py-2 plasmo-w-64 plasmo-focus:plasmo-outline-none plasmo-focus:plasmo-ring-2 plasmo-focus:plasmo-ring-blue-500"
        />
        <button
          type="submit"
          className="plasmo-bg-blue-500 plasmo-text-white plasmo-px-4 plasmo-py-2 plasmo-rounded plasmo-hover:plasmo-bg-blue-600"
        >
          Search
        </button>
      </form>

      <div className="plasmo-w-96 plasmo-flex plasmo-flex-col plasmo-gap-4">
        {results.length === 0 && query && (
          <p className="plasmo-text-gray-700">No results found</p>
        )}

        {results.map((item, index) => (
          <div key={index} className="plasmo-bg-white plasmo-shadow-md plasmo-rounded plasmo-p-4">
            <h2 className="plasmo-text-xl plasmo-font-semibold plasmo-mb-2">
              {item.japanese[0]?.word || item.japanese[0]?.reading}
            </h2>
            <p className="plasmo-text-gray-700">
              {item.senses.map((sense, i) => (
                <span key={i}>
                  {sense.english_definitions.join(", ")}
                  {i < item.senses.length - 1 ? "; " : ""}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>
    </div>
    </div>
  )
}

export default IndexPopup
