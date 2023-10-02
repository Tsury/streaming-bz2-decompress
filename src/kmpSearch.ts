const buildKmpTable = (pattern: Uint8Array) => {
  const table = new Array<number>(pattern.length).fill(0);
  let j = 0;

  for (let i = 1; i < pattern.length; i++) {
    if (pattern[i] === pattern[j]) {
      j++;
      table[i] = j;
    } else if (j > 0) {
      j = table[j - 1];
      i--;
    }
  }

  return table;
};

const kmpSearch = (text: Uint8Array, pattern: Uint8Array, skipFirst: boolean) => {
  const table = buildKmpTable(pattern);
  let j = 0;
  let firstMatchSkipped = false;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === pattern[j]) {
      j++;

      if (j === pattern.length) {
        // A match is found
        if (skipFirst && !firstMatchSkipped) {
          firstMatchSkipped = true;
          // Reset j to continue search
          j = 0;
        } else {
          return i - j + 1;
        }
      }
    } else if (j > 0) {
      j = table[j - 1];
      i--; // Rewind to re-check the current character in the next iteration
    }
  }

  return -1;
};

export default kmpSearch;
