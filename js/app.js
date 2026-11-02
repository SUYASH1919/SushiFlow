et consumed = 0;
let goal = 2500;

const history = [];

document.getElementById("currentDate").textContent =
    new Date().toDateString();

function addWater(amount) {

    if (!Number.isFinite(amount) || amount <= 0) return;

    consumed += amount;

    const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });

    history.unshift({ amount, time });

    updateDashboard();
}

function addCustomWater() {

    const input = document.getElementById("customAmount");
    const amount = Number(input.value);

    if (!Number.isFinite(amount) || amount <= 0) {
        alert("Enter a valid water amount!");
        return;
    }

    addWater(amount);
    input.value = "";
}

function updateDashboard() {

    const percentage = Math.round((consumed / goal) * 100);
    const remaining = Math.max(goal - consumed, 0);

    document.getElementById("percentage").textContent =
        percentage + "%";

    document.getElementById("consumed").textContent =
        consumed + " ml";

    document.getElementById("remaining").textContent =
        remaining;

    document.getElementById("waterFill").style.height =
        Math.min(percentage, 100) + "%";

    document.getElementById("progressFill").style.width =
        Math.min(percentage, 100) + "%";

    document.getElementById("historyList").innerHTML =
        history.length
            ? history.map(entry =>
                `<div class="history-entry">
                    <span>${entry.time}</span>
                    <strong>+${entry.amount} ml</strong>
                </div>`
              ).join("")
            : "<p>No water intake recorded yet.</p>";
}

