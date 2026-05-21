// ============================================
// E-COMMERCE STORE BACKEND - SQLITE VERSION
// ============================================

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// ============================================
// SQLITE DATABASE SETUP
// ============================================

// Open database (creates file automatically on your computer)
const db = new sqlite3.Database('./ecommerce.db');

// Create all tables
db.serialize(() => {
    // 1. Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 2. Products table
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        description TEXT,
        category TEXT,
        image TEXT,
        stock INTEGER DEFAULT 10
    )`);

    // 3. Orders table
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        items TEXT NOT NULL,
        total_amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // 4. Add sample products if database is empty
    db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
        if (err) {
            console.error('Error checking products:', err);
            return;
        }
        
        const imageMap = {
            'laptop.png': 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=500&auto=format&fit=crop&q=60',
            'mouse.png': 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=500&auto=format&fit=crop&q=60',
            'keyboard.png': 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=500&auto=format&fit=crop&q=60',
            'monitor.png': 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&auto=format&fit=crop&q=60',
            'headphones.png': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60',
            'watch.png': 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=60',
            'hub.png': 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=500&auto=format&fit=crop&q=60',
            'ssd.png': 'https://images.unsplash.com/photo-1601524909162-be87252be298?w=500&auto=format&fit=crop&q=60',
            'phone.png': 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&auto=format&fit=crop&q=60',
            'tablet.png': 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=500&auto=format&fit=crop&q=60',
            'charger.png': 'https://images.unsplash.com/photo-1622445262465-2481c4574875?w=500&auto=format&fit=crop&q=60',
            'webcam.png': 'https://images.unsplash.com/photo-1612444530582-fc66183b16f7?w=500&auto=format&fit=crop&q=60'
        };

        // Run automatic update migration for any existing products still using the old .png file references
        Object.keys(imageMap).forEach(key => {
            db.run("UPDATE products SET image = ? WHERE image = ?", [imageMap[key], key]);
        });

        // Also update the old broken SSD URL to the new high-quality one
        db.run("UPDATE products SET image = ? WHERE image = ?", [
            imageMap['ssd.png'],
            'https://images.unsplash.com/photo-1541140111813-8222e9d90981?w=500&auto=format&fit=crop&q=60'
        ]);
        
        if (row.count === 0) {
            console.log('Adding sample products...');
            
            const sampleProducts = [
                ['Gaming Laptop', 1299, 'High-performance gaming laptop with RTX 4060, 16GB RAM', 'Electronics', imageMap['laptop.png'], 10],
                ['Wireless Mouse', 29, 'Ergonomic wireless mouse with adjustable DPI, silent clicks', 'Accessories', imageMap['mouse.png'], 50],
                ['Mechanical Keyboard', 89, 'RGB mechanical keyboard with blue switches, wrist rest', 'Accessories', imageMap['keyboard.png'], 30],
                ['4K Monitor', 399, '27-inch 4K UHD monitor with IPS panel, 99% sRGB', 'Electronics', imageMap['monitor.png'], 15],
                ['Noise Cancelling Headphones', 199, 'Wireless headphones with active noise cancellation, 30hr battery', 'Audio', imageMap['headphones.png'], 25],
                ['Smart Watch', 249, 'Fitness tracker with heart rate monitor, GPS, 7-day battery', 'Wearables', imageMap['watch.png'], 20],
                ['USB-C Hub', 49, '7-in-1 USB-C hub with HDMI, USB 3.0, SD card reader', 'Accessories', imageMap['hub.png'], 40],
                ['External SSD', 119, '1TB external SSD, USB 3.2, up to 1000MB/s', 'Storage', imageMap['ssd.png'], 18]
            ];
            
            const stmt = db.prepare("INSERT INTO products (name, price, description, category, image, stock) VALUES (?, ?, ?, ?, ?, ?)");
            sampleProducts.forEach(product => {
                stmt.run(product, (err) => {
                    if (err) console.error('Error inserting product:', err);
                });
            });
            stmt.finalize();
            
            console.log('✅ Added 8 sample products to database');
        } else {
            console.log(`✅ Database already has ${row.count} products`);
        }
    });
});

// ============================================
// API ENDPOINTS
// ============================================

// ---------- REGISTER USER ----------
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;
    
    // Validate input
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    try {
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert user into database
        db.run("INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
            [name, email, hashedPassword],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        res.status(400).json({ error: 'Email already registered' });
                    } else {
                        res.status(500).json({ error: 'Registration failed' });
                    }
                } else {
                    res.json({ 
                        message: 'User created successfully!',
                        userId: this.lastID 
                    });
                }
            });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ---------- LOGIN USER ----------
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    
    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }
        
        // Compare password
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid password' });
        }
        
        // Create JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email }, 
            'SECRET_KEY_2024',
            { expiresIn: '7d' }
        );
        
        res.json({ 
            token, 
            userId: user.id, 
            name: user.name,
            email: user.email
        });
    });
});

// ---------- GET ALL PRODUCTS ----------
app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM products ORDER BY id", [], (err, products) => {
        if (err) {
            res.status(500).json({ error: 'Failed to fetch products' });
        } else {
            res.json(products);
        }
    });
});

// ---------- GET SINGLE PRODUCT ----------
app.get('/api/products/:id', (req, res) => {
    const productId = req.params.id;
    
    db.get("SELECT * FROM products WHERE id = ?", [productId], (err, product) => {
        if (err) {
            res.status(500).json({ error: 'Database error' });
        } else if (!product) {
            res.status(404).json({ error: 'Product not found' });
        } else {
            res.json(product);
        }
    });
});

// ---------- SEED PRODUCTS (Add more products manually) ----------
app.post('/api/seed-products', (req, res) => {
    const additionalProducts = [
        ['Smartphone', 699, 'Latest 5G smartphone with 128GB storage', 'Electronics', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&auto=format&fit=crop&q=60', 25],
        ['Tablet', 399, '10-inch tablet with stylus support', 'Electronics', 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=500&auto=format&fit=crop&q=60', 15],
        ['Wireless Charger', 29, 'Fast wireless charging pad', 'Accessories', 'https://images.unsplash.com/photo-1622445262465-2481c4574875?w=500&auto=format&fit=crop&q=60', 45],
        ['Webcam', 79, '1080p HD webcam with microphone', 'Electronics', 'https://images.unsplash.com/photo-1612444530582-fc66183b16f7?w=500&auto=format&fit=crop&q=60', 20]
    ];
    
    const stmt = db.prepare("INSERT INTO products (name, price, description, category, image, stock) VALUES (?, ?, ?, ?, ?, ?)");
    additionalProducts.forEach(product => {
        stmt.run(product);
    });
    stmt.finalize();
    
    res.json({ message: `Added ${additionalProducts.length} more products!` });
});

// ---------- CREATE ORDER ----------
app.post('/api/orders', (req, res) => {
    const { userId, items, totalAmount } = req.body;
    
    if (!userId || !items || !totalAmount) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const itemsJson = JSON.stringify(items);
    
    db.run("INSERT INTO orders (user_id, items, total_amount) VALUES (?, ?, ?)",
        [userId, itemsJson, totalAmount],
        function(err) {
            if (err) {
                console.error('Order error:', err);
                res.status(500).json({ error: 'Failed to place order' });
            } else {
                res.json({ 
                    message: 'Order placed successfully! 🎉',
                    orderId: this.lastID
                });
            }
        });
});

// ---------- GET USER ORDERS ----------
app.get('/api/orders/:userId', (req, res) => {
    const userId = req.params.userId;
    
    db.all("SELECT * FROM orders WHERE user_id = ? ORDER BY order_date DESC",
        [userId],
        (err, orders) => {
            if (err) {
                res.status(500).json({ error: 'Failed to fetch orders' });
            } else {
                // Parse items JSON for each order
                const ordersWithParsedItems = orders.map(order => ({
                    ...order,
                    items: JSON.parse(order.items)
                }));
                res.json(ordersWithParsedItems);
            }
        });
});

// ---------- GET ALL ORDERS (Admin view) ----------
app.get('/api/orders', (req, res) => {
    db.all(`SELECT o.*, u.name as user_name, u.email as user_email 
            FROM orders o 
            JOIN users u ON o.user_id = u.id 
            ORDER BY o.order_date DESC`, [], (err, orders) => {
        if (err) {
            res.status(500).json({ error: 'Failed to fetch orders' });
        } else {
            const ordersWithParsedItems = orders.map(order => ({
                ...order,
                items: JSON.parse(order.items)
            }));
            res.json(ordersWithParsedItems);
        }
    });
});

// ---------- UPDATE ORDER STATUS ----------
app.put('/api/orders/:id/status', (req, res) => {
    const { status } = req.body;
    const orderId = req.params.id;
    
    db.run("UPDATE orders SET status = ? WHERE id = ?",
        [status, orderId],
        function(err) {
            if (err) {
                res.status(500).json({ error: 'Failed to update order' });
            } else if (this.changes === 0) {
                res.status(404).json({ error: 'Order not found' });
            } else {
                res.json({ message: 'Order status updated' });
            }
        });
});

// ---------- GET DATABASE STATISTICS ----------
app.get('/api/stats', (req, res) => {
    db.get("SELECT COUNT(*) as users FROM users", [], (err, userCount) => {
        db.get("SELECT COUNT(*) as products FROM products", [], (err, productCount) => {
            db.get("SELECT COUNT(*) as orders FROM orders", [], (err, orderCount) => {
                res.json({
                    users: userCount.users,
                    products: productCount.products,
                    orders: orderCount.orders
                });
            });
        });
    });
});

// ---------- SEARCH PRODUCTS ----------
app.get('/api/products/search/:query', (req, res) => {
    const searchQuery = `%${req.params.query}%`;
    
    db.all("SELECT * FROM products WHERE name LIKE ? OR description LIKE ?",
        [searchQuery, searchQuery],
        (err, products) => {
            if (err) {
                res.status(500).json({ error: 'Search failed' });
            } else {
                res.json(products);
            }
        });
});

// ---------- START SERVER ----------
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     🚀 E-COMMERCE STORE BACKEND RUNNING                  ║
╚══════════════════════════════════════════════════════════╝

📡 Server: http://localhost:${PORT}
💾 Database: SQLite (ecommerce.db file)

📋 API Endpoints:
   POST   /api/register     - Create new account
   POST   /api/login        - Login to account
   GET    /api/products     - Get all products
   GET    /api/products/:id - Get single product
   POST   /api/seed-products - Add more products
   POST   /api/orders       - Place an order
   GET    /api/orders/:userId - Get user orders
   GET    /api/stats        - Get database statistics
   GET    /api/products/search/:query - Search products

✅ Ready to accept requests!
    `);
});