// --- Storage Keys ---
const TODAY_TASKS_KEY = 'tasks';
const SPILLOVER_TASKS_KEY = 'spilloverTasks';
const LAST_OPEN_DATE_KEY = 'lastOpenDate';

// --- Utility Functions ---

// Function to retrieve data from Chrome storage
function getData(key) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(key, (data) => {
            resolve(data[key]);
        });
    });
}

// Function to save data to Chrome storage
function saveData(data) {
    return new Promise((resolve) => {
        chrome.storage.sync.set(data, () => {
            resolve();
        });
    });
}

// Function to get the current date as a simple YYYY-MM-DD string
function getTodayDateString() {
    return new Date().toISOString().split('T')[0];
}

// --- Task Rendering ---

// Function to create an individual <li> task element
function createTaskElement(task, listArray, index, isSpillover = false) {
    const li = document.createElement('li');
    li.classList.add('task-item');
    if (task.completed) {
        li.classList.add('completed');
    }

    const taskText = document.createElement('span');
    taskText.classList.add('task-text');
    taskText.textContent = task.text;

    // Toggle completion on click
    taskText.addEventListener('click', async () => {
        listArray[index].completed = !listArray[index].completed;
        // Save the list based on where the click happened
        const key = isSpillover ? SPILLOVER_TASKS_KEY : TODAY_TASKS_KEY;
        await saveData({ [key]: listArray });
        // Re-render both lists to ensure state is accurate
        initialize();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.textContent = '✖';

    // Delete task on click
    deleteBtn.addEventListener('click', async () => {
        listArray.splice(index, 1);
        const key = isSpillover ? SPILLOVER_TASKS_KEY : TODAY_TASKS_KEY;
        await saveData({ [key]: listArray });
        initialize();
    });

    li.appendChild(taskText);
    li.appendChild(deleteBtn);
    return li;
}

// Function to render the task lists in the HTML
function renderLists(todayTasks, spilloverTasks) {
    const taskList = document.getElementById('taskList');
    const spilloverList = document.getElementById('spilloverList');

    taskList.innerHTML = '';
    spilloverList.innerHTML = '';

    // Render Today's Tasks
    todayTasks.forEach((task, index) => {
        taskList.appendChild(createTaskElement(task, todayTasks, index, false));
    });

    // Render Spillover Tasks
    const spilloverSection = document.getElementById('spilloverSection');
    if (spilloverTasks && spilloverTasks.length > 0) {
        spilloverSection.style.display = 'block';
        spilloverTasks.forEach((task, index) => {
            spilloverList.appendChild(createTaskElement(task, spilloverTasks, index, true));
        });
    } else {
        spilloverSection.style.display = 'none'; // Hide the section if no spillover tasks
    }
}

// --- Core Logic: Daily Rollover ---

async function handleDailyRollover(todayTasks, lastOpenDate) {
    const todayDate = getTodayDateString();

    // Check if the extension was last opened on a different day
    if (lastOpenDate && lastOpenDate !== todayDate) {

        console.log("New day detected! Performing rollover.");

        // 1. Identify incomplete tasks from yesterday (which are currently in todayTasks)
        const unfinishedTasks = todayTasks.filter(task => !task.completed);

        // 2. Filter today's list to only include completed tasks (which we'll discard)
        // and set the main list to be empty for the new day
        const newTodayTasks = [];

        // 3. Save the unfinished tasks as the new spillover list
        // Note: We don't need to save completed tasks from yesterday.
        await saveData({
            [SPILLOVER_TASKS_KEY]: unfinishedTasks,
            [TODAY_TASKS_KEY]: newTodayTasks, // Empty the main list for the new day
            [LAST_OPEN_DATE_KEY]: todayDate
        });

        // Return the newly created lists for rendering
        return {
            todayTasks: newTodayTasks,
            spilloverTasks: unfinishedTasks
        };

    } else if (!lastOpenDate) {
        // First-time open - set the date
        await saveData({ [LAST_OPEN_DATE_KEY]: todayDate });
    }

    // No rollover needed or first time, just return the existing lists
    const spilloverTasks = await getData(SPILLOVER_TASKS_KEY) || [];
    return { todayTasks: todayTasks, spilloverTasks: spilloverTasks };
}

// --- Input Handling ---

// Function to handle adding a new task (always goes to today's list)
async function addTask() {
    const input = document.getElementById('taskInput');
    const text = input.value.trim();

    if (text) {
        const tasks = await getData(TODAY_TASKS_KEY) || [];
        const newTask = { text: text, completed: false };
        tasks.push(newTask);

        await saveData({ [TODAY_TASKS_KEY]: tasks });

        input.value = ''; // Clear input field

        // Re-run initialization to re-render the lists
        initialize();
    }
}

// --- Initialization ---

async function initialize() {
    // 1. Load data from storage
    const todayTasks = await getData(TODAY_TASKS_KEY) || [];
    const lastOpenDate = await getData(LAST_OPEN_DATE_KEY);

    // 2. Handle the daily rollover logic
    const { todayTasks: finalTodayTasks, spilloverTasks: finalSpilloverTasks } =
        await handleDailyRollover(todayTasks, lastOpenDate);

    // 3. Render the lists
    renderLists(finalTodayTasks, finalSpilloverTasks);

    // 4. Set up event listeners (only on the first run)
    if (!document.getElementById('addTaskButton').hasAttribute('data-listeners-set')) {
        const addButton = document.getElementById('addTaskButton');
        const input = document.getElementById('taskInput');

        addButton.addEventListener('click', addTask);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addTask();
            }
        });
        addButton.setAttribute('data-listeners-set', 'true');
    }
}

// Run the initialization
initialize();