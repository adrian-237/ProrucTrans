// server.js (Final Version with All Features, Ready for Deployment)

// --- 1. Import Dependencies ---
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const session = require('express-session');

// --- 2. Initialize the App ---
const app = express();
// Use the PORT environment variable from the hosting service, or 3000 for local development
const PORT = process.env.PORT || 3000;

// --- 3. Configure Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- 4. CONFIGURE SESSION ---
app.use(session({
    // In a real production app, move this secret to an environment variable
    secret: process.env.SESSION_SECRET || 'a-very-strong-and-secret-key-for-proructrans',
    resave: false,
    saveUninitialized: false,
    cookie: {
        // In production, set 'secure' to true if you are using HTTPS
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true, // Prevents client-side JS from reading the cookie
        maxAge: 1000 * 60 * 60 * 24 // Cookie expires in 24 hours
    }
}));


// --- 5. Hardcoded Admin Credentials ---
const ADMIN_USER = {
    username: 'admin',
    password: 'admin'
};


// --- 6. Database Connection & Models ---
// This configuration works for both local development and deployment on Render
const dbPath = path.join(process.env.DATABASE_PATH || __dirname, 'proructrans.db');
console.log(`Using database at: ${dbPath}`);

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath // Use the dynamic path
});

const Order = sequelize.define('Order', {
  sender_name: { type: DataTypes.STRING, allowNull: false },
  sender_email: { type: DataTypes.STRING, allowNull: false },
  sender_address: { type: DataTypes.STRING, allowNull: false },
  recipient_address: { type: DataTypes.STRING, allowNull: false },
  service_type: { type: DataTypes.STRING },
  package_weight: { type: DataTypes.FLOAT },
  package_details: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING, defaultValue: 'Pending' },
  tracking_id: {
    type: DataTypes.STRING
    // The `unique: true` constraint is removed to prevent database errors on creation.
  }
});

const Message = sequelize.define('Message', {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  subject: { type: DataTypes.STRING, allowNull:false },
  message: { type: DataTypes.TEXT, allowNull: false },
});


// --- 7. AUTHENTICATION MIDDLEWARE & ROUTES ---
const requireLogin = (req, res, next) => {
    if (req.session && req.session.isLoggedIn) {
        return next();
    } else {
        return res.redirect('/login.html');
    }
};

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
        req.session.isLoggedIn = true;
        res.status(200).json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: 'Could not log out.' });
        }
        res.clearCookie('connect.sid');
        return res.status(200).json({ success: true, message: 'Logged out' });
    });
});


// --- 8. API ROUTES ---

// === ORDER ROUTES ===
app.post('/api/orders', async (req, res) => {
  try {
    const newOrder = await Order.create(req.body);
    // Generate and save the unique tracking ID after creation
    newOrder.tracking_id = `PRT-${newOrder.id}`;
    await newOrder.save();
    res.status(201).json({ message: 'Order placed successfully!', order: newOrder });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ message: 'Error placing order.', error: error });
  }
});

app.get('/api/track/:trackingId', async (req, res) => {
    try {
      const { trackingId } = req.params;
      const order = await Order.findOne({ 
        where: { tracking_id: trackingId.toUpperCase() }
      });
  
      if (!order) {
        return res.status(404).json({ message: 'No shipment found with this tracking ID.' });
      }
  
      const trackingInfo = {
        tracking_id: order.tracking_id,
        recipient_address: order.recipient_address,
        status: order.status,
        updatedAt: order.updatedAt
      };
      res.status(200).json(trackingInfo);
    } catch (error) {
      console.error("Error fetching tracking info:", error);
      res.status(500).json({ message: 'Error fetching shipment details.' });
    }
});

app.get('/api/orders', requireLogin, async (req, res) => {
  try {
    const orders = await Order.findAll({ order: [['createdAt', 'DESC']] });
    res.status(200).json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: 'Error fetching orders.', error: error });
  }
});

app.put('/api/orders/:id', requireLogin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const orderToUpdate = await Order.findByPk(id);
      if (!orderToUpdate) {
        return res.status(404).json({ message: 'Order not found.' });
      }
      orderToUpdate.status = status;
      await orderToUpdate.save();
      res.status(200).json({ message: 'Order status updated!', order: orderToUpdate });
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ message: 'Error updating order.', error: error });
    }
});

app.delete('/api/orders/:id', requireLogin, async (req, res) => {
    try {
        const { id } = req.params;
        const numDeleted = await Order.destroy({ where: { id: id } });
        if (numDeleted > 0) {
            res.status(200).json({ message: 'Order removed successfully' });
        } else {
            res.status(404).json({ message: 'Order not found.' });
        }
    } catch (error) {
        console.error("Error removing order:", error);
        res.status(500).json({ message: 'Error removing order.', error: error });
    }
});


// === MESSAGE ROUTES ===
app.post('/api/messages', async (req, res) => {
  try {
    const newMessage = await Message.create(req.body);
    res.status(201).json({ message: 'Message sent successfully!', data: newMessage });
  } catch (error) {
    console.error("Error saving message:", error);
    res.status(500).json({ message: 'Error sending message.', error: error.message });
  }
});

app.get('/api/messages', requireLogin, async (req, res) => {
  try {
    const messages = await Message.findAll({ order: [['createdAt', 'DESC']] });
    res.status(200).json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: 'Error fetching messages.', error: error });
  }
});

app.delete('/api/messages/:id', requireLogin, async (req, res) => {
    try {
        const { id } = req.params;
        const numDeleted = await Message.destroy({ where: { id: id } });
        if (numDeleted > 0) {
            res.status(200).json({ message: 'Message removed successfully' });
        } else {
            res.status(404).json({ message: 'Message not found.' });
        }
    } catch (error) {
        console.error("Error removing message:", error);
        res.status(500).json({ message: 'Error removing message.', error: error });
    }
});


// --- 9. SERVE STATIC & PROTECTED FILES ---
// This specific route protects the admin panel
app.get('/admin.html', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// This serves all other static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));


// --- 10. Start the Server ---
const startServer = async () => {
  try {
    // This syncs the models with the database, creating tables if they don't exist.
    await sequelize.sync();
    console.log('Database file "proructrans.db" is synced and ready.');
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
};

startServer();