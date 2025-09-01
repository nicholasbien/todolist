# MongoDB Atlas Setup Instructions

## Steps to set up MongoDB Atlas Free Tier

### 1. Create MongoDB Atlas Account
Go to: **https://www.mongodb.com/cloud/atlas/register**

### 2. Create a Free Cluster
Once logged in:
- Choose **FREE** Shared Cluster (M0 Sandbox)
- Select **AWS** as provider
- Choose a region close to you (e.g., us-east-1)
- Name your cluster (e.g., "todolist-cluster")
- Click **Create Cluster**

### 3. Set up Database Access
- Go to **Database Access** in the left menu
- Click **Add New Database User**
- Username: `todolist-admin`
- Password: Generate a secure password (save it!)
- User Privileges: **Atlas Admin**
- Click **Add User**

### 4. Set up Network Access
- Go to **Network Access** in the left menu
- Click **Add IP Address**
- For development, click **Allow Access from Anywhere** (0.0.0.0/0)
- Note: For production, you'd want to restrict this to specific IPs
- Click **Confirm**

### 5. Get Connection String
- Go to **Database** in the left menu
- Click **Connect** on your cluster
- Choose **Connect your application**
- Select **Driver**: Node.js, **Version**: 5.5 or later
- Copy the connection string, it will look like:
```
mongodb+srv://todolist-admin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

### 6. Update the Backend .env File
Replace the `MONGODB_URL` in `/backend/.env` with your Atlas connection string:
```
MONGODB_URL=mongodb+srv://todolist-admin:<password>@cluster0.xxxxx.mongodb.net/todolist?retryWrites=true&w=majority
```
**Important**: Replace `<password>` with the actual password you created in step 3.

### 7. Restart Backend Server
After updating the .env file, restart the backend server for changes to take effect.

## MongoDB Atlas vs Railway MongoDB Comparison

### MongoDB Atlas
**Pros:**
- Free tier (512MB storage)
- Purpose-built for MongoDB
- Advanced monitoring and performance tools
- Global clusters available
- Atlas Search included
- Better scaling options

**Cons:**
- Separate service to manage
- Need to manage IP whitelist
- Potential network latency

### Railway MongoDB
**Pros:**
- Same platform as backend
- Simple one-click setup
- Private networking
- Lower latency
- Unified billing

**Cons:**
- Costs money (~$5/month minimum)
- Less MongoDB-specific features
- Manual backup setup needed
