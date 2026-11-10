// Deliberately insecure. Planted for the scanner self-test.
function render() {
  const name = new URLSearchParams(window.location.search).get("name");
  document.getElementById("greeting").innerHTML = "Hello " + name;
}

function calc(expr) {
  return eval(expr);
}

module.exports = { render, calc };
