// userAuthentication.js
import { hashPassword, validateToken } from './security';
import { UserModel } from './models/User';
import { auditLog } from './utils/logging';

/**
 * User authentication and session management
 * @class AuthenticationService
 */
class AuthenticationService {
<<<<<<< HEAD
  // Updated version with improved security and async/await
  constructor(options = {}) {
    this.tokenExpiration = options.tokenExpiration || 3600;
    this.maxLoginAttempts = options.maxLoginAttempts || 5;
    this.lockoutDuration = options.lockoutDuration || 30 * 60 * 1000;
    this.securityLevel = options.securityLevel || 'standard';
    
    this.initialize();
  }
  
  async initialize() {
    await this.loadSecurityPolicies();
    console.log('Authentication service initialized with security level:', this.securityLevel);
  }
  
  async loadSecurityPolicies() {
    // Implementation of security policy loading
    return Promise.resolve();
  }
||||||| merged common ancestors
  // Original version
  constructor(options = {}) {
    this.tokenExpiration = options.tokenExpiration || 3600;
    this.maxLoginAttempts = options.maxLoginAttempts || 3;
    
    console.log('Authentication service initialized');
  }
=======
  // Refactored version with additional features and monitoring
  constructor(options = {}) {
    this.tokenExpiration = options.tokenExpiration || 7200; // Extended to 2 hours
    this.maxLoginAttempts = options.maxLoginAttempts || 10;
    this.monitoringEnabled = options.monitoring || false;
    this.analyticsCallback = options.analyticsCallback || null;
    
    this.setup();
  }
  
  setup() {
    this.setupMonitoring();
    console.log('Authentication service ready with monitoring:', this.monitoringEnabled);
  }
  
  setupMonitoring() {
    if (this.monitoringEnabled) {
      // Set up monitoring system
    }
  }
>>>>>>> feature/analytics

  /**
   * Authenticate user with credentials
   * @param {string} username - User's username
   * @param {string} password - User's password
<<<<<<< HEAD
   * @param {Object} options - Additional authentication options
   * @returns {Promise<Object>} Authentication result with token
   */
  async authenticateUser(username, password, options = {}) {
    try {
      await this.checkLoginAttempts(username);
      
      const user = await UserModel.findOne({ username });
      
      if (!user) {
        await this.recordFailedAttempt(username);
        throw new Error('Authentication failed: User not found');
      }
      
      const passwordMatch = await hashPassword.compare(password, user.passwordHash);
      
      if (!passwordMatch) {
        await this.recordFailedAttempt(username);
        throw new Error('Authentication failed: Invalid password');
      }
      
      await this.resetLoginAttempts(username);
      
      const token = await this.generateToken(user, options);
      auditLog('USER_LOGIN', { username, success: true });
      
      return {
        user: this.sanitizeUser(user),
        token,
        expiresIn: this.tokenExpiration
      };
    } catch (error) {
      auditLog('USER_LOGIN', { username, success: false, error: error.message });
      throw error;
    }
  }
  
  async checkLoginAttempts(username) {
    const attempts = await UserModel.getLoginAttempts(username);
    
    if (attempts >= this.maxLoginAttempts) {
      const lastAttempt = await UserModel.getLastLoginAttempt(username);
      const lockoutTime = new Date(lastAttempt.getTime() + this.lockoutDuration);
      
      if (new Date() < lockoutTime) {
        throw new Error(`Account temporarily locked. Try again after ${lockoutTime}`);
      } else {
        await this.resetLoginAttempts(username);
      }
    }
  }
||||||| merged common ancestors
   * @returns {Promise<Object>} Authentication result with token
   */
  authenticateUser(username, password) {
    return new Promise((resolve, reject) => {
      UserModel.findOne({ username }, (err, user) => {
        if (err) {
          return reject(err);
        }
        
        if (!user) {
          return reject(new Error('Authentication failed: User not found'));
        }
        
        hashPassword.compare(password, user.passwordHash, (err, match) => {
          if (err || !match) {
            return reject(new Error('Authentication failed: Invalid password'));
          }
          
          const token = this.generateToken(user);
          
          resolve({
            user: {
              id: user.id,
              username: user.username,
              email: user.email
            },
            token,
            expiresIn: this.tokenExpiration
          });
        });
      });
    });
  }
=======
   * @param {Object} context - Request context for analytics
   * @returns {Promise<Object>} Authentication result with token and analytics
   */
  authenticateUser(username, password, context = {}) {
    return new Promise((resolve, reject) => {
      // Track authentication attempt for analytics
      const startTime = Date.now();
      const attemptId = this.generateAttemptId();
      
      if (this.analyticsCallback) {
        this.analyticsCallback({
          type: 'AUTH_ATTEMPT',
          username,
          timestamp: new Date(),
          context,
          attemptId
        });
      }
      
      UserModel.findOne({ username })
        .then(user => {
          if (!user) {
            this.trackFailedAttempt(attemptId, 'user_not_found', startTime);
            throw new Error('Authentication failed: User not found');
          }
          
          return Promise.all([
            user,
            hashPassword.compare(password, user.passwordHash)
          ]);
        })
        .then(([user, passwordMatch]) => {
          if (!passwordMatch) {
            this.trackFailedAttempt(attemptId, 'invalid_password', startTime);
            throw new Error('Authentication failed: Invalid password');
          }
          
          // Check if user account is enabled
          if (!user.accountEnabled) {
            this.trackFailedAttempt(attemptId, 'account_disabled', startTime);
            throw new Error('Authentication failed: Account disabled');
          }
          
          const token = this.generateToken(user, context);
          
          // Track successful authentication
          this.trackSuccessfulAttempt(attemptId, user.id, startTime);
          
          resolve({
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              lastLogin: new Date()
            },
            token,
            expiresIn: this.tokenExpiration,
            analytics: {
              loginTime: Date.now() - startTime,
              attemptId
            }
          });
        })
        .catch(error => {
          reject(error);
        });
    });
  }
  
  trackFailedAttempt(attemptId, reason, startTime) {
    if (this.analyticsCallback) {
      this.analyticsCallback({
        type: 'AUTH_FAILURE',
        reason,
        attemptId,
        duration: Date.now() - startTime,
        timestamp: new Date()
      });
    }
  }
  
  trackSuccessfulAttempt(attemptId, userId, startTime) {
    if (this.analyticsCallback) {
      this.analyticsCallback({
        type: 'AUTH_SUCCESS',
        userId,
        attemptId,
        duration: Date.now() - startTime,
        timestamp: new Date()
      });
    }
  }
  
  generateAttemptId() {
    return `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
>>>>>>> feature/analytics

<<<<<<< HEAD
  async generateToken(user, options = {}) {
    const tokenData = {
      userId: user.id,
      username: user.username,
      roles: user.roles,
      securityLevel: this.securityLevel,
      ...options.additionalClaims
    };
    
    return validateToken.create(tokenData, {
      expiresIn: this.tokenExpiration,
      algorithm: 'RS256'
    });
  }
  
  async recordFailedAttempt(username) {
    await UserModel.incrementLoginAttempts(username);
  }
  
  async resetLoginAttempts(username) {
    await UserModel.resetLoginAttempts(username);
  }
  
  sanitizeUser(user) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles,
      lastLogin: new Date()
    };
  }
||||||| merged common ancestors
  generateToken(user) {
    const tokenData = {
      userId: user.id,
      username: user.username
    };
    
    return validateToken.create(tokenData, {
      expiresIn: this.tokenExpiration
    });
  }
=======
  generateToken(user, context = {}) {
    const tokenData = {
      userId: user.id,
      username: user.username,
      deviceInfo: context.deviceInfo || 'unknown',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    };
    
    // Generate token with enhanced security
    return validateToken.create(tokenData, {
      expiresIn: this.tokenExpiration,
      algorithm: 'HS512'
    });
  }
>>>>>>> feature/analytics

  /**
   * Verify authentication token
<<<<<<< HEAD
   * @param {string} token - Authentication token
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Decoded token data
   */
  async verifyToken(token, options = {}) {
    try {
      const decoded = await validateToken.verify(token, {
        ignoreExpiration: options.ignoreExpiration || false,
        algorithms: ['RS256']
      });
      
      // Additional verification steps
      if (options.validateUser) {
        const user = await UserModel.findById(decoded.userId);
        
        if (!user || user.isDisabled) {
          throw new Error('Token verification failed: User invalid or disabled');
        }
        
        if (user.securityStamp !== decoded.securityStamp) {
          throw new Error('Token verification failed: Security credentials changed');
        }
      }
      
      auditLog('TOKEN_VERIFY', { 
        userId: decoded.userId,
        success: true 
      });
      
      return decoded;
    } catch (error) {
      auditLog('TOKEN_VERIFY', { 
        token: token.substring(0, 10) + '...',
        success: false,
        error: error.message
      });
      
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }
||||||| merged common ancestors
   * @param {string} token - Authentication token
   * @returns {Promise<Object>} Decoded token data
   */
  verifyToken(token) {
    return new Promise((resolve, reject) => {
      validateToken.verify(token, (err, decoded) => {
        if (err) {
          return reject(new Error(`Token verification failed: ${err.message}`));
        }
        
        resolve(decoded);
      });
    });
  }
=======
   * @param {string} token - Authentication token
   * @param {Object} options - Verification options and context
   * @returns {Promise<Object>} Decoded token data with usage analytics
   */
  verifyToken(token, options = {}) {
    const startTime = Date.now();
    const verificationId = this.generateAttemptId();
    
    if (this.analyticsCallback) {
      this.analyticsCallback({
        type: 'TOKEN_VERIFICATION',
        verificationId,
        timestamp: new Date(),
        context: options.context || {}
      });
    }
    
    return new Promise((resolve, reject) => {
      validateToken.verify(token, { algorithms: ['HS512'] }, (err, decoded) => {
        if (err) {
          if (this.analyticsCallback) {
            this.analyticsCallback({
              type: 'TOKEN_VERIFICATION_FAILURE',
              verificationId,
              error: err.message,
              duration: Date.now() - startTime,
              timestamp: new Date()
            });
          }
          
          return reject(new Error(`Token verification failed: ${err.message}`));
        }
        
        // Check token device info if available
        if (options.context && options.context.deviceInfo &&
            decoded.deviceInfo !== 'unknown' &&
            decoded.deviceInfo !== options.context.deviceInfo) {
          
          // Log suspicious activity but don't immediately reject
          if (this.analyticsCallback) {
            this.analyticsCallback({
              type: 'SUSPICIOUS_TOKEN_USAGE',
              verificationId,
              userId: decoded.userId,
              reason: 'device_mismatch',
              originalDevice: decoded.deviceInfo,
              currentDevice: options.context.deviceInfo,
              timestamp: new Date()
            });
          }
        }
        
        if (this.analyticsCallback) {
          this.analyticsCallback({
            type: 'TOKEN_VERIFICATION_SUCCESS',
            verificationId,
            userId: decoded.userId,
            duration: Date.now() - startTime,
            timestamp: new Date()
          });
        }
        
        resolve({
          ...decoded,
          verificationMetadata: {
            verifiedAt: new Date(),
            verificationLatency: Date.now() - startTime
          }
        });
      });
    });
  }
>>>>>>> feature/analytics

  /**
   * Logout user and invalidate token
<<<<<<< HEAD
   * @param {string} token - Authentication token to invalidate
   * @param {Object} options - Logout options
   * @returns {Promise<boolean>} Logout success status
   */
  async logoutUser(token, options = {}) {
    try {
      const decoded = await validateToken.decode(token);
      
      // Add token to blacklist
      await this.blacklistToken(token, decoded);
      
      // Perform additional cleanup if requested
      if (options.clearAllSessions && decoded.userId) {
        await this.clearAllUserSessions(decoded.userId);
      }
      
      auditLog('USER_LOGOUT', { 
        userId: decoded.userId,
        username: decoded.username,
        success: true
      });
      
      return true;
    } catch (error) {
      auditLog('USER_LOGOUT', {
        token: token.substring(0, 10) + '...',
        success: false,
        error: error.message
      });
      
      throw error;
    }
  }
  
  async blacklistToken(token, decodedData) {
    // Implementation to blacklist token
    return Promise.resolve();
  }
  
  async clearAllUserSessions(userId) {
    // Implementation to clear all user sessions
    return Promise.resolve();
  }
||||||| merged common ancestors
   * @param {string} token - Authentication token to invalidate
   * @returns {Promise<boolean>} Logout success status
   */
  logoutUser(token) {
    return new Promise((resolve) => {
      // In the original version, tokens are not tracked server-side
      // so logout is always successful
      resolve(true);
    });
  }
=======
   * @param {string} token - Authentication token to invalidate
   * @param {Object} options - Logout options and analytics context
   * @returns {Promise<Object>} Logout result with analytics
   */
  logoutUser(token, options = {}) {
    const startTime = Date.now();
    const logoutId = this.generateAttemptId();
    
    return new Promise((resolve, reject) => {
      try {
        const decoded = validateToken.decode(token);
        
        if (this.analyticsCallback) {
          this.analyticsCallback({
            type: 'LOGOUT_ATTEMPT',
            logoutId,
            userId: decoded?.userId,
            context: options.context || {},
            timestamp: new Date()
          });
        }
        
        // Add token to blacklist with Redis
        this.blacklistToken(token, decoded)
          .then(() => {
            // Track additional device information
            if (options.context && options.context.deviceInfo) {
              return this.trackDeviceLogout(decoded?.userId, options.context.deviceInfo);
            }
          })
          .then(() => {
            if (this.analyticsCallback) {
              this.analyticsCallback({
                type: 'LOGOUT_SUCCESS',
                logoutId,
                userId: decoded?.userId,
                duration: Date.now() - startTime,
                timestamp: new Date()
              });
            }
            
            resolve({
              success: true,
              userId: decoded?.userId,
              analytics: {
                logoutTime: Date.now() - startTime,
                logoutId
              }
            });
          })
          .catch(error => {
            if (this.analyticsCallback) {
              this.analyticsCallback({
                type: 'LOGOUT_FAILURE',
                logoutId,
                userId: decoded?.userId,
                error: error.message,
                duration: Date.now() - startTime,
                timestamp: new Date()
              });
            }
            
            reject(error);
          });
      } catch (error) {
        if (this.analyticsCallback) {
          this.analyticsCallback({
            type: 'LOGOUT_FAILURE',
            logoutId,
            error: error.message,
            duration: Date.now() - startTime,
            timestamp: new Date()
          });
        }
        
        reject(error);
      }
    });
  }
  
  blacklistToken(token, decodedData) {
    // Implementation using Redis or similar for token blacklisting
    return Promise.resolve();
  }
  
  trackDeviceLogout(userId, deviceInfo) {
    // Track device logout for security analysis
    return Promise.resolve();
  }
>>>>>>> feature/analytics
}

export default AuthenticationService;