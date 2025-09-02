const OpenAI = require('openai');
const { AFKCore, HookType } = require('@probelabs/afk-core');

/**
 * OpenAI Assistant with AFK remote control integration
 * Provides remote approval for function calls and cost tracking
 */
class OpenAIAssistantAFK {
  constructor(config) {
    this.openai = new OpenAI({ 
      apiKey: config.apiKey 
    });
    
    this.assistantId = config.assistantId;
    this.config = config;
    
    // Initialize AFK with system-specific configuration
    this.afk = new AFKCore({
      systemName: 'openai-assistant',
      telegramConfig: config.afkConfig.telegramConfig,
      autoApprove: config.afkConfig.autoApprove || [],
      autoDeny: config.afkConfig.autoDeny || [],
      customConfig: {
        budget: config.afkConfig.budget || {},
        functions: config.afkConfig.functions || {}
      }
    });
    
    // Cost tracking
    this.costTracker = {
      hourly: 0,
      daily: 0,
      lastReset: Date.now()
    };
    
    this.setupHooks();
  }
  
  async initialize() {
    await this.afk.initialize();
    console.log('OpenAI Assistant AFK initialized');
  }
  
  setupHooks() {
    // Function call approval hook
    this.afk.registerHook(HookType.PRE_ACTION, async (context) => {
      const { action } = context;
      
      if (action.type === 'function_call') {
        return await this.handleFunctionApproval(context);
      }
      
      if (action.type === 'model_call') {
        return await this.handleModelCallApproval(context);
      }
      
      return { decision: 'allow' };
    });
    
    // Cost tracking hook
    this.afk.registerHook(HookType.POST_ACTION, async (context) => {
      if (context.action.type === 'model_call') {
        await this.updateCostTracking(context);
      }
    });
    
    // Error handling
    this.afk.registerHook(HookType.ERROR, async (context) => {
      await this.afk.sendNotification({
        title: '🚨 OpenAI Assistant Error',
        message: `Error in session ${context.sessionId}: ${context.error.message}`,
        priority: 'high'
      });
    });
  }
  
  async handleFunctionApproval(context) {
    const { action } = context;
    const functionName = action.name;
    const parameters = action.parameters;
    
    // Check auto-approval rules
    const autoApprove = this.config.afkConfig.autoApprove || [];
    const autoDeny = this.config.afkConfig.autoDeny || [];
    
    if (autoApprove.includes(functionName)) {
      return { decision: 'allow' };
    }
    
    if (autoDeny.includes(functionName)) {
      return { 
        decision: 'deny', 
        message: `Function ${functionName} is not allowed` 
      };
    }
    
    // Risk assessment
    const risk = this.assessFunctionRisk(functionName, parameters);
    
    if (risk === 'low') {
      return { decision: 'allow' };
    }
    
    // Request approval for medium/high risk functions
    return await this.afk.requestApproval({
      title: `🔧 Function Call: ${functionName}`,
      message: this.formatFunctionMessage(functionName, parameters),
      details: this.formatFunctionDetails(action),
      icon: this.getFunctionIcon(functionName),
      color: risk === 'high' ? 'red' : 'yellow',
      buttons: [
        { 
          id: 'approve', 
          text: '✅ Allow Function', 
          action: 'approve',
          style: 'primary'
        },
        { 
          id: 'deny', 
          text: '❌ Block Function', 
          action: 'deny',
          style: 'danger' 
        },
        { 
          id: 'always_allow', 
          text: '🔄 Always Allow This Function', 
          action: 'custom',
          customAction: 'always_allow',
          requiresConfirmation: true
        }
      ],
      timeout: 300000, // 5 minutes
      context: context,
      metadata: {
        estimatedDuration: this.estimateFunctionDuration(functionName),
        cost: this.estimateFunctionCost(functionName, parameters),
        resources: this.getFunctionResources(functionName)
      }
    });
  }
  
  async handleModelCallApproval(context) {
    const { action } = context;
    const estimatedCost = action.parameters.estimatedCost || 0;
    
    // Check budget limits
    const budget = this.config.afkConfig.budget || {};
    
    if (budget.maxCostPerHour && 
        this.costTracker.hourly + estimatedCost > budget.maxCostPerHour) {
      
      return await this.afk.requestApproval({
        title: '💰 Budget Alert: Hourly Limit',
        message: `This request will exceed hourly budget limit.\n\nCurrent: $${this.costTracker.hourly.toFixed(3)}\nEstimated: +$${estimatedCost.toFixed(3)}\nLimit: $${budget.maxCostPerHour}`,
        icon: '💰',
        color: 'yellow',
        buttons: [
          { id: 'approve', text: '💸 Approve Anyway', action: 'approve' },
          { id: 'deny', text: '🛑 Block Request', action: 'deny' }
        ],
        context: context
      });
    }
    
    return { decision: 'allow' };
  }
  
  formatFunctionMessage(functionName, parameters) {
    const paramStr = Object.entries(parameters)
      .map(([key, value]) => {
        if (typeof value === 'string' && value.length > 100) {
          return `${key}: ${value.substring(0, 100)}...`;
        }
        return `${key}: ${JSON.stringify(value)}`;
      })
      .join('\n');
    
    return `**Function:** ${functionName}\n\n**Parameters:**\n\`\`\`\n${paramStr}\n\`\`\``;
  }
  
  formatFunctionDetails(action) {
    return [
      `**Risk Level:** ${action.risk}`,
      `**Reversible:** ${action.reversible ? 'Yes' : 'No'}`,
      `**Session:** ${action.sessionId}`,
      `**Timestamp:** ${new Date(action.timestamp).toLocaleString()}`
    ].join('\n');
  }
  
  assessFunctionRisk(functionName, parameters) {
    // High risk functions
    const highRisk = [
      'run_code', 'execute_script', 'shell_command',
      'delete_file', 'modify_file', 'send_email',
      'api_call', 'database_query', 'payment_process'
    ];
    
    // Medium risk functions  
    const mediumRisk = [
      'create_file', 'read_file', 'search_files',
      'web_request', 'data_analysis', 'image_generation'
    ];
    
    if (highRisk.some(pattern => functionName.includes(pattern))) {
      return 'high';
    }
    
    if (mediumRisk.some(pattern => functionName.includes(pattern))) {
      return 'medium';
    }
    
    return 'low';
  }
  
  getFunctionIcon(functionName) {
    const icons = {
      'weather': '🌤️',
      'search': '🔍', 
      'calculate': '🧮',
      'file': '📁',
      'code': '💻',
      'email': '📧',
      'api': '🔗',
      'data': '📊'
    };
    
    for (const [key, icon] of Object.entries(icons)) {
      if (functionName.toLowerCase().includes(key)) {
        return icon;
      }
    }
    
    return '🔧';
  }
  
  estimateFunctionDuration(functionName) {
    const durations = {
      'get_weather': 2000,
      'search_web': 5000,
      'run_code': 30000,
      'file_operations': 10000,
      'api_call': 15000
    };
    
    return durations[functionName] || 5000;
  }
  
  estimateFunctionCost(functionName, parameters) {
    // Cost estimates in USD
    const baseCosts = {
      'run_code': 0.01,
      'api_call': 0.005,
      'data_analysis': 0.02,
      'image_generation': 0.04
    };
    
    return baseCosts[functionName] || 0.001;
  }
  
  getFunctionResources(functionName) {
    const resources = {
      'run_code': ['CPU', 'Memory', 'Disk'],
      'api_call': ['Network', 'Rate Limits'],
      'file_operations': ['Disk', 'Permissions'],
      'data_analysis': ['CPU', 'Memory']
    };
    
    return resources[functionName] || ['CPU'];
  }
  
  async updateCostTracking(context) {
    const cost = context.result?.usage?.totalCost || 0;
    const now = Date.now();
    
    // Reset counters if needed
    if (now - this.costTracker.lastReset > 3600000) { // 1 hour
      this.costTracker.hourly = 0;
      this.costTracker.lastReset = now;
    }
    
    if (now - this.costTracker.lastReset > 86400000) { // 24 hours
      this.costTracker.daily = 0;
    }
    
    this.costTracker.hourly += cost;
    this.costTracker.daily += cost;
    
    // Send budget warnings
    const budget = this.config.afkConfig.budget || {};
    
    if (budget.maxCostPerHour && 
        this.costTracker.hourly > budget.maxCostPerHour * 0.8) {
      await this.afk.sendNotification({
        title: '⚠️ Budget Warning',
        message: `Approaching hourly budget limit: $${this.costTracker.hourly.toFixed(3)} / $${budget.maxCostPerHour}`,
        priority: 'normal'
      });
    }
  }
  
  /**
   * Main chat method with AFK protection
   */
  async chat(userId, message, options = {}) {
    const sessionId = `openai-${userId}-${Date.now()}`;
    const session = this.afk.createSession(sessionId);
    
    try {
      // Session start notification
      await this.afk.triggerHook(HookType.SESSION_START, {
        sessionId,
        custom: { userId, message: message.substring(0, 100) }
      });
      
      // Create thread if needed
      let threadId = options.threadId;
      if (!threadId) {
        const thread = await this.openai.beta.threads.create();
        threadId = thread.id;
      }
      
      // Add user message
      await this.openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: message
      });
      
      // Run with AFK monitoring
      const run = await this.openai.beta.threads.runs.create(threadId, {
        assistant_id: this.assistantId
      });
      
      const result = await this.monitorRun(threadId, run.id, sessionId);
      
      return {
        threadId,
        response: result,
        session: sessionId
      };
      
    } catch (error) {
      await this.afk.triggerHook(HookType.ERROR, {
        sessionId,
        error: { message: error.message, stack: error.stack }
      });
      throw error;
    } finally {
      await this.afk.triggerHook(HookType.SESSION_END, {
        sessionId
      });
    }
  }
  
  async monitorRun(threadId, runId, sessionId) {
    while (true) {
      const run = await this.openai.beta.threads.runs.retrieve(threadId, runId);
      
      if (run.status === 'completed') {
        const messages = await this.openai.beta.threads.messages.list(threadId);
        return messages.data[0].content[0].text.value;
      }
      
      if (run.status === 'requires_action') {
        await this.handleRequiredActions(threadId, runId, run, sessionId);
      }
      
      if (run.status === 'failed' || run.status === 'cancelled') {
        throw new Error(`Run ${run.status}: ${run.last_error?.message || 'Unknown error'}`);
      }
      
      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  async handleRequiredActions(threadId, runId, run, sessionId) {
    const toolOutputs = [];
    
    for (const toolCall of run.required_action.submit_tool_outputs.tool_calls) {
      const functionName = toolCall.function.name;
      const parameters = JSON.parse(toolCall.function.arguments);
      
      // Request approval through AFK
      const approval = await this.afk.triggerHook(HookType.PRE_ACTION, {
        sessionId,
        action: {
          id: toolCall.id,
          name: functionName,
          type: 'function_call',
          description: `Execute function: ${functionName}`,
          risk: this.assessFunctionRisk(functionName, parameters),
          reversible: this.isFunctionReversible(functionName),
          parameters,
          timestamp: Date.now()
        }
      });
      
      if (approval.decision === 'approve') {
        // Execute function (implement your function logic here)
        const output = await this.executeFunction(functionName, parameters);
        
        toolOutputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify(output)
        });
      } else {
        toolOutputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify({ 
            error: 'Function call denied by remote control',
            reason: approval.message 
          })
        });
      }
    }
    
    // Submit tool outputs
    await this.openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
      tool_outputs: toolOutputs
    });
  }
  
  async executeFunction(name, parameters) {
    // Implement your function execution logic here
    // This is where you'd call your actual function implementations
    
    switch (name) {
      case 'get_weather':
        return await this.getWeather(parameters.location);
      case 'search_web':
        return await this.searchWeb(parameters.query);
      case 'calculate':
        return await this.calculate(parameters.expression);
      default:
        throw new Error(`Function ${name} not implemented`);
    }
  }
  
  isFunctionReversible(functionName) {
    const irreversible = [
      'delete_file', 'send_email', 'api_call', 
      'payment_process', 'system_shutdown'
    ];
    
    return !irreversible.includes(functionName);
  }
  
  // Example function implementations
  async getWeather(location) {
    // Implement weather API call
    return { temperature: 72, condition: 'sunny', location };
  }
  
  async searchWeb(query) {
    // Implement web search
    return { results: [`Search results for: ${query}`] };
  }
  
  async calculate(expression) {
    // Implement safe calculation
    try {
      // Use a safe math evaluator here, not eval()
      const result = this.safeEvaluate(expression);
      return { result, expression };
    } catch (error) {
      return { error: error.message, expression };
    }
  }
  
  safeEvaluate(expr) {
    // Implement safe math evaluation
    // This is a simplified example - use a proper math parser in production
    if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
      throw new Error('Invalid expression');
    }
    return eval(expr); // Use a safer alternative in production
  }
}

module.exports = { OpenAIAssistantAFK };