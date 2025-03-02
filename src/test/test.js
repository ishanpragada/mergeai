// userAuthentication.js
import { hashPassword, validateToken } from './security';
import { UserModel } from './models/User';
import { auditLog } from './utils/logging';

/**
 * User authentication and session management
 * @class AuthenticationService
 */
class AuthenticationService {

constructor(options = {}) {
    this.tokenExpiration = options.tokenExpiration || 7200; 
    this.maxLoginAttempts = options.maxLoginAttempts || 5;
    this.lockoutDuration = options.lockoutDuration || 30 * 60 * 1000;
    this.securityLevel = options.securityLevel || 'standard';
    this.monitoringEnabled = options.monitoring || false;
    this.analyticsCallback = options.analyticsCallback || null;
    
    this.initialize();
}

async initialize() {
    this.setupMonitoring();
    await this.loadSecurityPolicies();
    console.log('Authentication service initialized with security level:', this.securityLevel);
}

setupMonitoring() {
    if (this.monitoringEnabled) {
        // Set up monitoring system
    }
}

async loadSecurityPolicies() {
    // Implementation of security policy loading
    return Promise.resolve();
}

  /**
   * Authenticate user with credentials
   * @param {string} username - User's username
   * @param {string} password - User's password

* @param {Object} context - Request context for analytics
   * @returns {Promise<Object>} Authentication result with token and analytics
   */
  async authenticateUser(username, password, context = {}) {
    try {
      await this.checkLoginAttempts(username);
      
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

      const user = await UserModel.findOne({ username });
      
      if (!user) {
        this.trackFailedAttempt(attemptId, 'user_not_found', startTime);
        throw new Error('Authentication failed: User not found');
      }

      const passwordMatch = await hashPassword.compare(password, user.passwordHash);
      
      if (!passwordMatch) {
        this.trackFailedAttempt(attemptId, 'invalid_password', startTime);
        throw new Error('Authentication failed: Invalid password');
      }
      
      await this.resetLoginAttempts(username);

      const token = await this.generateToken(user, context);
      this.trackSuccessfulAttempt(attemptId, user.id, startTime);
      
      return {
        user: this.sanitizeUser(user),
        token,
        expiresIn: this.tokenExpiration,
        analytics: {
          loginTime: Date.now() - startTime,
          attemptId
        }
      };
    } catch (error) {
      if (this.analyticsCallback) {
        this.analyticsCallback({type: 'AUTH_FAILURE', error, attemptId, timestamp: new Date() });
      }
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


async generateToken(user, context = {}) {
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

  /**
   * Verify authentication token

/**
   * @param {string} token - Authentication token
   * @param {Object} options - Verification options and context
   * @returns {Promise<Object>} Decoded token data with usage analytics
   */
  async verifyToken(token, options = {}) {
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

    try {
      const decoded = await validateToken.verify(token, {
        ignoreExpiration: options.ignoreExpiration || false,
        algorithms: ['RS256']
      });
      
      if (options.validateUser) {
        const user = await UserModel.findById(decoded.userId);
        
        if (!user || user.isDisabled) {
          throw new Error('Token verification failed: User invalid or disabled');
        }
        
        if (user.securityStamp !== decoded.securityStamp) {
          throw new Error('Token verification failed: Security credentials changed');
        }
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

      auditLog('TOKEN_VERIFY', { 
        userId: decoded.userId,
        success: true 
      });
      
      return {
        ...decoded,
        verificationMetadata: {
          verifiedAt: new Date(),
          verificationLatency: Date.now() - startTime
        }
      };
      
    } catch (error) {
      if (this.analyticsCallback) {
        this.analyticsCallback({
          type: 'TOKEN_VERIFICATION_FAILURE',
          verificationId,
          error: error.message,
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
      }

      auditLog('TOKEN_VERIFY', { 
        token: token.substring(0, 10) + '...',
        success: false,
        error: error.message
      });
      
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  /**
   * Logout user and invalidate token

/**
   * @param {string} token - Authentication token to invalidate
   * @param {Object} options - Logout options and analytics context
   * @returns {Promise<Object>} Logout result with analytics
   */
  async logoutUser(token, options = {}) {
    const startTime = Date.now();
    const logoutId = this.generateAttemptId();
    
    try {
      const decoded = await validateToken.decode(token);

      if (this.analyticsCallback) {
        this.analyticsCallback({
          type: 'LOGOUT_ATTEMPT',
          logoutId,
          userId: decoded?.userId,
          context: options.context || {},
          timestamp: new Date()
        });
      }
      
      // Add token to blacklist
      await this.blacklistToken(token, decoded);

      // Track additional device information
      if (options.context && options.context.deviceInfo) {
        await this.trackDeviceLogout(decoded?.userId, options.context.deviceInfo);
      }

      // Perform additional cleanup if requested
      if (options.clearAllSessions && decoded.userId) {
        await this.clearAllUserSessions(decoded.userId);
      }

      if (this.analyticsCallback) {
        this.analyticsCallback({
          type: 'LOGOUT_SUCCESS',
          logoutId,
          userId: decoded?.userId,
          duration: Date.now() - startTime,
          timestamp: new Date()
        });
      }

      return {
        success: true,
        userId: decoded?.userId,
        analytics: {
          logoutTime: Date.now() - startTime,
          logoutId
        }
      };

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

  async trackDeviceLogout(userId, deviceInfo) {
    // Track device logout for security analysis
    return Promise.resolve();
  }
}

export default AuthenticationService;