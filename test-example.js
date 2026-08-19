// Sample JavaScript code for testing the AI Assistant extension

/**
 * Calculate the total price of items in a shopping cart
 */
function calculateTotal(items) {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
        total += items[i].price * items[i].quantity;
    }
    return total;
}

/**
 * Example usage
 */
const cart = [
    { name: 'Apple', price: 1.50, quantity: 3 },
    { name: 'Banana', price: 0.75, quantity: 6 },
    { name: 'Orange', price: 2.00, quantity: 2 }
];

const totalPrice = calculateTotal(cart);
console.log('Total:', totalPrice);

// Another function to test
function findMaxValue(numbers) {
    let max = numbers[0];
    for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] > max) {
            max = numbers[i];
        }
    }
    return max;
}

const values = [23, 45, 12, 67, 34, 89, 11];
console.log('Max value:', findMaxValue(values));
