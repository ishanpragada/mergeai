// Function to add two numbers
<<<<<<< HEAD
function add(a, b) {
    return a + b;
}
=======
const add = (a, b) => a + b;
>>>>>>> feature-branch

// Function to subtract two numbers
<<<<<<< HEAD
function subtract(a, b) {
    return a - b;
}
=======
const subtract = (a, b) => a - b;
>>>>>>> feature-branch

// Function to multiply two numbers
<<<<<<< HEAD
function multiply(a, b) {
    return a * b;
}
=======
const multiply = (a, b) => {
    console.log(`Multiplying ${a} and ${b}`);
    return a * b;
};
>>>>>>> feature-branch

// Function to divide two numbers
<<<<<<< HEAD
function divide(a, b) {
    if (b === 0) {
        throw new Error("Cannot divide by zero");
    }
    return a / b;
}
=======
const divide = (a, b) => b !== 0 ? a / b : 'Error: Division by zero';
>>>>>>> feature-branch

// Function to calculate modulus
<<<<<<< HEAD
function modulus(a, b) {
    return a % b;
}
=======
const modulus = (a, b) => {
    console.log(`Modulus of ${a} % ${b}`);
    return a % b;
};
>>>>>>> feature-branch

// Function to calculate power
<<<<<<< HEAD
function power(a, b) {
    return Math.pow(a, b);
}
=======
const power = (a, b) => a ** b;
>>>>>>> feature-branch

// Function to calculate the square root
<<<<<<< HEAD
function squareRoot(a) {
    return Math.sqrt(a);
}
=======
const squareRoot = a => {
    console.log(`Square root of ${a}`);
    return Math.sqrt(a);
};
>>>>>>> feature-branch

// Function to find the maximum value in an array
<<<<<<< HEAD
function findMax(arr) {
    return Math.max(...arr);
}
=======
const findMax = arr => {
    console.log(`Finding max in ${arr}`);
    return Math.max(...arr);
};
>>>>>>> feature-branch

// Function to find the minimum value in an array
<<<<<<< HEAD
function findMin(arr) {
    return Math.min(...arr);
}
=======
const findMin = arr => {
    console.log(`Finding min in ${arr}`);
    return Math.min(...arr);
};
>>>>>>> feature-branch

// Function to calculate the sum of an array
<<<<<<< HEAD
function sumArray(arr) {
    return arr.reduce((acc, num) => acc + num, 0);
}
=======
const sumArray = arr => {
    console.log(`Summing array: ${arr}`);
    return arr.reduce((acc, num) => acc + num, 0);
};
>>>>>>> feature-branch

// Function to calculate the average of an array
<<<<<<< HEAD
function averageArray(arr) {
    return sumArray(arr) / arr.length;
}
=======
const averageArray = arr => {
    console.log(`Averaging array: ${arr}`);
    return sumArray(arr) / arr.length;
};
>>>>>>> feature-branch

console.log(add(5, 3));
console.log(subtract(10, 7));
console.log(multiply(4, 6));
console.log(divide(8, 2));
console.log(modulus(10, 3));
console.log(power(2, 3));
console.log(squareRoot(16));
console.log(findMax([3, 7, 1, 9]));
console.log(findMin([3, 7, 1, 9]));
console.log(sumArray([1, 2, 3, 4, 5]));
console.log(averageArray([1, 2, 3, 4, 5]));
