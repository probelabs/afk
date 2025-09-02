const { ChatOpenAI } = require('langchain/chat_models/openai');
const { initializeAgentExecutorWithOptions } = require('langchain/agents');
const { DynamicTool, Tool } = require('langchain/tools');
const { BufferMemory } = require('langchain/memory');
const { AFKCore, HookType } = require('@probelabs/afk-core');

/**
 * LangChain Agent with AFK remote control integration
 * Provides remote approval for tool execution and chain operations
 */
class LangChainAFK {
  constructor(config) {
    this.config = config;
    
    // Initialize AFK core
    this.afk = new AFKCore({
      systemName: 'langchain-agent',
      telegramConfig: config.afkConfig.telegramConfig,
      autoApprove: config.afkConfig.autoApproveTools || [],
      autoDeny: config.afkConfig.autoDenyTools || [],
      customConfig: config.afkConfig
    });
    
    // Initialize LangChain components
    this.llm = new ChatOpenAI({
      modelName: config.llmConfig.modelName || 'gpt-4',
      temperature: config.llmConfig.temperature || 0.7,
      openAIApiKey: process.env.OPENAI_API_KEY
    });
    
    this.memory = new BufferMemory({
      memoryKey: 'chat_history',
      returnMessages: true
    });
    
    // Tool execution tracking
    this.executionContext = {
      currentChain: null,
      toolCalls: [],
      approvalCache: new Map()
    };
    
    this.setupHooks();
    this.initializeTools();
  }
  
  async initialize() {
    await this.afk.initialize();
    
    // Create the agent executor with AFK-wrapped tools
    this.executor = await initializeAgentExecutorWithOptions(
      this.afkTools,
      this.llm,
      {
        agentType: 'zero-shot-react-description',
        memory: this.memory,
        verbose: true,
        handleParsingErrors: true
      }
    );
    
    console.log('LangChain AFK Agent initialized');
  }
  
  setupHooks() {
    // Tool execution approval
    this.afk.registerHook(HookType.PRE_ACTION, async (context) => {
      const { action } = context;
      
      if (action.type === 'tool_call') {
        return await this.handleToolApproval(context);
      }
      
      if (action.type === 'chain_execution') {
        return await this.handleChainApproval(context);
      }
      
      return { decision: 'allow' };
    });
    
    // Chain completion tracking
    this.afk.registerHook(HookType.POST_ACTION, async (context) => {
      if (context.action.type === 'tool_call') {
        await this.logToolExecution(context);
      }
    });
    
    // Error handling
    this.afk.registerHook(HookType.ERROR, async (context) => {
      await this.handleExecutionError(context);
    });
  }
  
  initializeTools() {
    const toolConfigs = this.config.tools || [];
    this.afkTools = [];
    
    for (const toolName of toolConfigs) {
      const tool = this.createTool(toolName);
      if (tool) {
        this.afkTools.push(this.wrapToolWithAFK(tool));
      }
    }
  }
  
  createTool(toolName) {
    switch (toolName) {
      case 'calculator':
        return this.createCalculatorTool();
      case 'search':
        return this.createSearchTool();
      case 'filesystem':
        return this.createFilesystemTool();
      case 'web_scraper':
        return this.createWebScraperTool();
      default:
        console.warn(`Unknown tool: ${toolName}`);
        return null;
    }
  }
  
  createCalculatorTool() {
    return new DynamicTool({
      name: 'calculator',
      description: 'Perform mathematical calculations. Input should be a mathematical expression.',
      func: async (input) => {
        try {
          // Use a safe math evaluator
          const result = this.safeEvaluate(input);
          return `Result: ${result}`;
        } catch (error) {
          return `Error: ${error.message}`;
        }
      }
    });
  }
  
  createSearchTool() {
    return new DynamicTool({
      name: 'search',
      description: 'Search the web for information. Input should be a search query.',
      func: async (input) => {
        // Implement web search logic
        return `Search results for "${input}": [Mock search results]`;
      }
    });
  }
  
  createFilesystemTool() {
    return new DynamicTool({
      name: 'filesystem',
      description: 'Perform file system operations. Input should be a JSON object with operation and parameters.',
      func: async (input) => {
        try {
          const operation = JSON.parse(input);
          return await this.executeFilesystemOperation(operation);
        } catch (error) {
          return `Error: ${error.message}`;
        }
      }
    });
  }
  
  createWebScraperTool() {
    return new DynamicTool({
      name: 'web_scraper',
      description: 'Extract data from web pages. Input should be a URL.',
      func: async (input) => {
        // Implement web scraping logic
        return `Scraped data from ${input}: [Mock scraped content]`;
      }
    });
  }
  
  wrapToolWithAFK(tool) {
    const originalFunc = tool.func;
    
    tool.func = async (input, runManager) => {
      const sessionId = this.getCurrentSessionId();
      const toolCall = {
        id: `tool-${Date.now()}-${Math.random()}`,
        name: tool.name,
        input: input,
        timestamp: Date.now()
      };
      
      try {
        // Request approval through AFK
        const approval = await this.afk.triggerHook(HookType.PRE_ACTION, {
          sessionId,
          action: {
            id: toolCall.id,
            name: tool.name,
            type: 'tool_call',
            description: tool.description,
            risk: this.assessToolRisk(tool.name, input),
            reversible: this.isToolReversible(tool.name),
            parameters: { input },
            timestamp: toolCall.timestamp,
            context: {
              chain: this.executionContext.currentChain,
              previousTools: this.executionContext.toolCalls.slice(-3),
              memoryContext: await this.getMemoryContext()
            }
          }
        });
        
        if (approval.decision !== 'allow') {
          const errorMsg = approval.message || `Tool execution denied: ${tool.name}`;
          throw new Error(errorMsg);
        }
        
        // Execute the original tool
        const result = await originalFunc(input, runManager);
        
        // Track successful execution
        this.executionContext.toolCalls.push({
          ...toolCall,
          result: result,
          status: 'completed'
        });
        
        // Post-execution hook
        await this.afk.triggerHook(HookType.POST_ACTION, {
          sessionId,
          action: {
            id: toolCall.id,
            name: tool.name,
            type: 'tool_call',
            parameters: { input },
            timestamp: toolCall.timestamp
          },
          result: { output: result, status: 'success' }
        });
        
        return result;
        
      } catch (error) {
        // Track failed execution
        this.executionContext.toolCalls.push({
          ...toolCall,
          error: error.message,
          status: 'failed'
        });
        
        // Error hook
        await this.afk.triggerHook(HookType.ERROR, {
          sessionId,
          error: {
            message: error.message,
            stack: error.stack,
            tool: tool.name,
            input: input
          }
        });
        
        throw error;
      }
    };
    
    return tool;
  }
  
  async handleToolApproval(context) {
    const { action } = context;
    const toolName = action.name;
    const input = action.parameters.input;
    
    // Check approval cache
    const cacheKey = `${toolName}:${JSON.stringify(input)}`;
    if (this.executionContext.approvalCache.has(cacheKey)) {
      return this.executionContext.approvalCache.get(cacheKey);
    }
    
    // Risk-based approval
    const risk = action.risk;
    const autoApprove = this.config.afkConfig.autoApproveTools || [];
    const autoDeny = this.config.afkConfig.autoDenyTools || [];
    
    if (autoApprove.includes(toolName)) {
      return { decision: 'allow' };
    }
    
    if (autoDeny.includes(toolName)) {
      return { 
        decision: 'deny', 
        message: `Tool ${toolName} is blocked by policy` 
      };
    }
    
    if (risk === 'low') {
      return { decision: 'allow' };
    }
    
    // Request approval
    const response = await this.afk.requestApproval({
      title: `🔧 LangChain Tool: ${toolName}`,
      message: this.formatToolMessage(toolName, input, action.context),
      details: this.formatToolDetails(action),
      icon: this.getToolIcon(toolName),
      color: risk === 'high' ? 'red' : 'yellow',
      buttons: [
        { 
          id: 'approve', 
          text: '✅ Execute Tool', 
          action: 'approve',
          style: 'primary'
        },
        { 
          id: 'deny', 
          text: '❌ Block Tool', 
          action: 'deny',
          style: 'danger' 
        },
        { 
          id: 'approve_chain', 
          text: '🔗 Approve Entire Chain', 
          action: 'custom',
          customAction: 'approve_chain'
        }
      ],
      timeout: 300000,
      context: context
    });
    
    // Cache the response for similar requests
    this.executionContext.approvalCache.set(cacheKey, response);
    
    return response;
  }
  
  async handleChainApproval(context) {
    const { action } = context;
    
    return await this.afk.requestApproval({
      title: `🔗 Chain Execution`,
      message: `Execute chain with ${action.parameters.toolCount} tools?\n\nQuery: "${action.parameters.query}"`,
      details: `Expected tools: ${action.parameters.expectedTools.join(', ')}`,
      icon: '🔗',
      color: 'yellow',
      buttons: [
        { id: 'approve', text: '✅ Execute Chain', action: 'approve' },
        { id: 'deny', text: '❌ Block Chain', action: 'deny' },
        { id: 'step_by_step', text: '👆 Step-by-step Approval', action: 'custom', customAction: 'step_by_step' }
      ],
      context: context
    });
  }
  
  formatToolMessage(toolName, input, context) {
    let message = `**Tool:** ${toolName}\n\n**Input:**\n\`\`\`\n${this.truncateText(input, 200)}\n\`\`\``;
    
    if (context?.chain) {
      message += `\n\n**Chain Context:** ${context.chain}`;
    }
    
    if (context?.previousTools?.length > 0) {
      const prevTools = context.previousTools.map(t => t.name).join(' → ');
      message += `\n\n**Previous Tools:** ${prevTools}`;
    }
    
    return message;
  }
  
  formatToolDetails(action) {
    const details = [
      `**Risk Level:** ${action.risk}`,
      `**Reversible:** ${action.reversible ? 'Yes' : 'No'}`,
      `**Timestamp:** ${new Date(action.timestamp).toLocaleString()}`
    ];
    
    if (action.context?.memoryContext) {
      details.push(`**Memory Context:** ${this.truncateText(action.context.memoryContext, 100)}`);
    }
    
    return details.join('\n');
  }
  
  assessToolRisk(toolName, input) {
    const highRisk = ['filesystem', 'system_command', 'web_scraper'];
    const mediumRisk = ['api_call', 'database_query', 'email_sender'];
    
    if (highRisk.includes(toolName)) {
      // Additional input-based risk assessment
      if (typeof input === 'string') {
        if (input.includes('delete') || input.includes('remove') || input.includes('rm ')) {
          return 'high';
        }
      }
      return 'medium';
    }
    
    if (mediumRisk.includes(toolName)) {
      return 'medium';
    }
    
    return 'low';
  }
  
  isToolReversible(toolName) {
    const irreversible = ['filesystem', 'email_sender', 'api_call', 'system_command'];
    return !irreversible.includes(toolName);
  }
  
  getToolIcon(toolName) {
    const icons = {
      calculator: '🧮',
      search: '🔍',
      filesystem: '📁',
      web_scraper: '🕷️',
      api_call: '🔗',
      database_query: '💾',
      email_sender: '📧'
    };
    
    return icons[toolName] || '🔧';
  }
  
  async getMemoryContext() {
    try {
      const messages = await this.memory.chatHistory.getMessages();
      const lastMessage = messages[messages.length - 1];
      return lastMessage ? lastMessage.content : '';
    } catch (error) {
      return '';
    }
  }
  
  getCurrentSessionId() {
    return this.executionContext.currentChain || `langchain-${Date.now()}`;
  }
  
  truncateText(text, maxLength) {
    if (typeof text !== 'string') {
      text = JSON.stringify(text);
    }
    
    if (text.length <= maxLength) {
      return text;
    }
    
    return text.substring(0, maxLength) + '...';
  }
  
  safeEvaluate(expression) {
    // Basic safe math evaluation
    if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
      throw new Error('Invalid mathematical expression');
    }
    
    try {
      return Function(`"use strict"; return (${expression})`)();
    } catch (error) {
      throw new Error('Calculation error');
    }
  }
  
  async executeFilesystemOperation(operation) {
    const { action, path, content } = operation;
    
    switch (action) {
      case 'read':
        return `Contents of ${path}: [Mock file contents]`;
      case 'write':
        return `File written to ${path}`;
      case 'list':
        return `Files in ${path}: file1.txt, file2.txt, directory1/`;
      case 'delete':
        return `Deleted ${path}`;
      default:
        throw new Error(`Unknown filesystem operation: ${action}`);
    }
  }
  
  async logToolExecution(context) {
    console.log(`Tool executed: ${context.action.name} - ${context.result?.status || 'unknown'}`);
  }
  
  async handleExecutionError(context) {
    await this.afk.sendNotification({
      title: '🚨 LangChain Agent Error',
      message: `Error in tool "${context.error.tool}": ${context.error.message}`,
      priority: 'high'
    });
  }
  
  /**
   * Main execution method with AFK protection
   */
  async run(query, options = {}) {
    const sessionId = `langchain-${Date.now()}`;
    this.executionContext.currentChain = sessionId;
    this.executionContext.toolCalls = [];
    this.executionContext.approvalCache.clear();
    
    try {
      // Session start hook
      await this.afk.triggerHook(HookType.SESSION_START, {
        sessionId,
        custom: { query: query.substring(0, 100) }
      });
      
      // Chain-level approval if enabled
      if (this.config.afkConfig.chainApproval?.enabled) {
        const expectedTools = this.predictRequiredTools(query);
        
        if (expectedTools.length >= (this.config.afkConfig.chainApproval.threshold || 3)) {
          const chainApproval = await this.afk.triggerHook(HookType.PRE_ACTION, {
            sessionId,
            action: {
              name: 'chain_execution',
              type: 'chain_execution',
              description: 'Execute LangChain agent chain',
              risk: 'medium',
              parameters: {
                query,
                toolCount: expectedTools.length,
                expectedTools
              }
            }
          });
          
          if (chainApproval.decision !== 'allow') {
            throw new Error('Chain execution denied');
          }
        }
      }
      
      // Execute the agent
      const result = await this.executor.call({ input: query });
      
      // Success notification
      await this.afk.sendNotification({
        title: '✅ Chain Complete',
        message: `Query: "${query.substring(0, 50)}..."\n\nTools used: ${this.executionContext.toolCalls.length}`,
        priority: 'low'
      });
      
      return {
        output: result.output,
        toolCalls: this.executionContext.toolCalls,
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
      
      // Cleanup
      this.executionContext.currentChain = null;
    }
  }
  
  predictRequiredTools(query) {
    // Simple heuristic to predict which tools might be needed
    const toolKeywords = {
      calculator: ['calculate', 'math', 'compute', 'sum', 'multiply'],
      search: ['search', 'find', 'look up', 'what is', 'information'],
      filesystem: ['file', 'read', 'write', 'save', 'load', 'directory'],
      web_scraper: ['scrape', 'extract', 'website', 'webpage', 'crawl']
    };
    
    const queryLower = query.toLowerCase();
    const predictedTools = [];
    
    for (const [tool, keywords] of Object.entries(toolKeywords)) {
      if (keywords.some(keyword => queryLower.includes(keyword))) {
        predictedTools.push(tool);
      }
    }
    
    return predictedTools;
  }
}

module.exports = { LangChainAFK };