// Test file for verifying code block rendering, language translation, and TTS

/**
 * Example function to test AI Assistant features
 * Select this entire function and test:
 * 1. Analyze Code - Check if code block has Copy button
 * 2. Change language to Hindi/Bengali - Check if explanation translates but code stays same
 * 3. Click Listen - Check if only explanation is read (not code), and voice is female
 */
function calculateFactorial(n: number): number {
    // Base case: factorial of 0 is 1
    if (n === 0 || n === 1) {
        return 1;
    }
    
    // Recursive case: n! = n × (n-1)!
    return n * calculateFactorial(n - 1);
}

/**
 * Example class to test with code blocks
 */
class UserManager {
    private users: Map<string, User>;
    
    constructor() {
        this.users = new Map();
    }
    
    addUser(id: string, user: User): void {
        this.users.set(id, user);
    }
    
    getUser(id: string): User | undefined {
        return this.users.get(id);
    }
    
    deleteUser(id: string): boolean {
        return this.users.delete(id);
    }
}

interface User {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
}

// Test with different programming constructs
const asyncExample = async () => {
    try {
        const response = await fetch('https://api.example.com/data');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
};

// Array operations
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
const sum = numbers.reduce((acc, n) => acc + n, 0);
const evens = numbers.filter(n => n % 2 === 0);

export { calculateFactorial, UserManager, asyncExample };
