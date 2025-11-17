<script lang="ts">
  import miniDict from "../assets/lib/mini-dict.json";
  let count: number = 0;
  const increment = () => {
    count += 1;
  };
</script>

<button on:click={increment}>
  count is {count}
  {miniDict.length}
</button>
