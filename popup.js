// --- Storage Keys ---
const TODAY_TASKS_KEY = 'tasks';
const SPILLOVER_TASKS_KEY = 'spilloverTasks';
const LAST_OPEN_DATE_KEY = 'lastOpenDate';

// --- Utility Functions ---

function getData(key) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(key, (data) => {
            resolve(data[key] || []);
        });
    });
}

function saveData(data) {
    return new Promise((resolve) => {
        chrome.storage.sync.set(data, () => {
            resolve();
        });
    });
}

// Custom promise-based setTimeout for async functions (used for the animation delay)
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

    // 1. Create Checkbox Element
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.classList.add('task-checkbox');

    // Completion Logic on Change
    checkbox.addEventListener('change', async () => {
        // 1. Instantly update the task status in the storage array
        listArray[index].completed = checkbox.checked;

        const key = isSpillover ? SPILLOVER_TASKS_KEY : TODAY_TASKS_KEY;
        await saveData({ [key]: listArray });

        // 2. Visually apply the 'completed' class immediately
        li.classList.toggle('completed', checkbox.checked);

        // 3. CRITICAL: Animation Logic
        if (checkbox.checked) {
            // If checking complete, trigger the fade-out animation
            li.classList.add('fading-out');
            await sleep(400); // Wait for the 400ms CSS animation to complete
        } else {
            // If unchecking, ensure the list updates immediately
            await sleep(50);
        }

        // 4. Re-render the list to apply the new sorting order
        initialize();
    });

    const taskText = document.createElement('span');
    taskText.classList.add('task-text');
    taskText.textContent = task.text;

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.textContent = '✖';

    // Delete task on click (Uses the correct original index)
    deleteBtn.addEventListener('click', async () => {
        listArray.splice(index, 1);
        const key = isSpillover ? SPILLOVER_TASKS_KEY : TODAY_TASKS_KEY;
        await saveData({ [key]: listArray });
        initialize();
    });

    li.appendChild(checkbox);
    li.appendChild(taskText);
    li.appendChild(deleteBtn);
    return li;
}

// Function to render the task lists in the HTML (Includes Sorting Logic)
function renderLists(todayTasks, spilloverTasks) {
    const taskList = document.getElementById('taskList');
    const spilloverList = document.getElementById('spilloverList');

    taskList.innerHTML = '';
    spilloverList.innerHTML = '';

    // Sort Today's Tasks (Incomplete first)
    const sortedTodayTasks = todayTasks.slice().sort((a, b) => a.completed - b.completed);

    // Render Sorted Today's Tasks
    sortedTodayTasks.forEach((task) => {
        // Find by unique ID
        const originalIndex = todayTasks.findIndex(t => t.id === task.id);

        if (originalIndex !== -1) {
            taskList.appendChild(createTaskElement(task, todayTasks, originalIndex, false));
        }
    });

    // Sort Spillover Tasks (Incomplete first)
    const sortedSpilloverTasks = spilloverTasks.slice().sort((a, b) => a.completed - b.completed);

    // Render Spillover Tasks
    const spilloverSection = document.getElementById('spilloverSection');
    if (sortedSpilloverTasks && sortedSpilloverTasks.length > 0) {
        spilloverSection.style.display = 'block';
        sortedSpilloverTasks.forEach((task) => {
            // Find by unique ID for spillover list
            const originalIndex = spilloverTasks.findIndex(t => t.id === task.id);

            if (originalIndex !== -1) {
                spilloverList.appendChild(createTaskElement(task, spilloverTasks, originalIndex, true));
            }
        });
    } else {
        spilloverSection.style.display = 'none';
    }
}

// --- Core Logic: Daily Rollover (Unchanged) ---

async function handleDailyRollover(todayTasks, lastOpenDate) {
    const todayDate = getTodayDateString();

    if (lastOpenDate && lastOpenDate !== todayDate) {
        console.log("New day detected! Performing rollover.");

        const unfinishedTasks = todayTasks.filter(task => !task.completed);
        const newTodayTasks = [];

        await saveData({
            [SPILLOVER_TASKS_KEY]: unfinishedTasks,
            [TODAY_TASKS_KEY]: newTodayTasks,
            [LAST_OPEN_DATE_KEY]: todayDate
        });

        return {
            todayTasks: newTodayTasks,
            spilloverTasks: unfinishedTasks
        };

    } else if (!lastOpenDate) {
        await saveData({ [LAST_OPEN_DATE_KEY]: todayDate });
    }

    const spilloverTasks = await getData(SPILLOVER_TASKS_KEY);
    return { todayTasks: todayTasks, spilloverTasks: spilloverTasks };
}

// --- Input Handling ---

async function addTask() {
    const input = document.getElementById('taskInput');
    const text = input.value.trim();

    if (text) {
        const tasks = await getData(TODAY_TASKS_KEY);
        // FIX: Assign a unique ID using a timestamp
        const newTask = {
            id: Date.now(),
            text: text,
            completed: false
        };

        tasks.push(newTask);

        await saveData({ [TODAY_TASKS_KEY]: tasks });

        input.value = '';

        initialize();
    }
}

// --- Initialization ---

async function initialize() {
    const todayTasks = await getData(TODAY_TASKS_KEY);
    const lastOpenDate = await getData(LAST_OPEN_DATE_KEY);

    const { todayTasks: finalTodayTasks, spilloverTasks: finalSpilloverTasks } =
        await handleDailyRollover(todayTasks, lastOpenDate);

    renderLists(finalTodayTasks, finalSpilloverTasks);

    const addButton = document.getElementById('addTaskButton');
    const input = document.getElementById('taskInput');

    if (!addButton.hasAttribute('data-listeners-set')) {
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