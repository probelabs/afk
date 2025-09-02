#!/usr/bin/env python3
"""
Generic AI Agent Template with AFK Integration
Template for integrating any AI system with AFK remote approval

This template provides:
- Base classes for easy integration
- Risk assessment framework
- Customizable approval policies
- Error handling patterns
- Session management
"""

import os
import json
import subprocess
import time
import logging
from typing import Dict, Any, Optional, List, Callable
from enum import Enum
from dataclasses import dataclass
from abc import ABC, abstractmethod

class RiskLevel(Enum):
    LOW = "low"
    MEDIUM = "medium" 
    HIGH = "high"
    CRITICAL = "critical"

@dataclass
class ActionResult:
    success: bool
    approved: bool
    result: Any = None
    error: str = None

class AFKIntegration:
    """Core AFK integration using subprocess calls"""
    
    def __init__(self, session_id: str = None, timeout: int = 300):
        self.session_id = session_id or f"ai-{os.getpid()}"
        self.cwd = os.getcwd()
        self.timeout = timeout
        self.logger = logging.getLogger(f"afk.{self.session_id}")
        
    def request_approval(self, action_name: str, action_params: Dict[str, Any]) -> bool:
        """Request approval for an action using afk binary"""
        hook_input = {
            "tool_name": action_name,
            "tool_input": action_params,
            "session_id": self.session_id,
            "cwd": self.cwd,
            "transcript_path": f"/tmp/{self.session_id}.jsonl"
        }
        
        try:
            result = subprocess.run(
                ['afk', 'hook', 'pretooluse'],
                input=json.dumps(hook_input, indent=2),
                text=True,
                capture_output=True,
                timeout=self.timeout
            )
            
            # Return codes: 0=approved, 2=denied, 1=error
            return result.returncode == 0
            
        except subprocess.TimeoutExpired:
            self.logger.warning(f"Approval timeout for {action_name}")
            return False
        except FileNotFoundError:
            self.logger.error("AFK binary not found. Install with: npm install -g @probelabs/afk")
            return False
        except Exception as e:
            self.logger.error(f"AFK integration error: {e}")
            return False
    
    def notify_session_start(self):
        """Notify AFK of session start"""
        hook_input = {
            "session_id": self.session_id,
            "cwd": self.cwd,
            "transcript_path": f"/tmp/{self.session_id}.jsonl"
        }
        
        try:
            subprocess.run(
                ['afk', 'hook', 'sessionstart'],
                input=json.dumps(hook_input),
                text=True,
                capture_output=True,
                timeout=30
            )
        except Exception:
            pass  # Silently fail for notifications
    
    def notify_session_end(self):
        """Notify AFK of session completion"""
        hook_input = {
            "session_id": self.session_id,
            "cwd": self.cwd,
            "stop_hook_active": True
        }
        
        try:
            subprocess.run(
                ['afk', 'hook', 'stop'],
                input=json.dumps(hook_input),
                text=True,
                capture_output=True,
                timeout=30
            )
        except Exception:
            pass  # Silently fail for notifications

class RiskAssessor:
    """Configurable risk assessment for AI actions"""
    
    def __init__(self):
        self.risk_patterns = {
            RiskLevel.CRITICAL: [
                r'rm\s+-rf\s+/',
                r'format\s+c:',
                r'del.*\*.*',
                r'DROP\s+DATABASE',
            ],
            RiskLevel.HIGH: [
                r'rm\s+',
                r'delete.*file',
                r'execute.*code',
                r'shell.*command',
                r'subprocess',
                r'eval\(',
                r'exec\(',
            ],
            RiskLevel.MEDIUM: [
                r'write.*file',
                r'modify.*config',
                r'network.*request',
                r'http.*request',
                r'install.*package',
            ],
            RiskLevel.LOW: [
                r'read.*file',
                r'analyze.*data',
                r'calculate',
                r'search',
                r'list.*dir',
            ]
        }
        
        # Custom risk assessors (functions that take action_name, params and return RiskLevel)
        self.custom_assessors: List[Callable[[str, Dict], Optional[RiskLevel]]] = []
    
    def assess(self, action_name: str, action_params: Dict[str, Any]) -> RiskLevel:
        """Assess risk level of an action"""
        
        # Try custom assessors first
        for assessor in self.custom_assessors:
            risk = assessor(action_name, action_params)
            if risk:
                return risk
        
        # Check against patterns
        action_text = f"{action_name} {json.dumps(action_params)}".lower()
        
        import re
        for risk_level, patterns in self.risk_patterns.items():
            for pattern in patterns:
                if re.search(pattern, action_text, re.IGNORECASE):
                    return risk_level
        
        # Default to medium risk for unknown actions
        return RiskLevel.MEDIUM
    
    def add_custom_assessor(self, assessor: Callable[[str, Dict], Optional[RiskLevel]]):
        """Add custom risk assessor function"""
        self.custom_assessors.append(assessor)

class ApprovalPolicy:
    """Configurable approval policy"""
    
    def __init__(self):
        # Which risk levels require approval
        self.require_approval = {
            RiskLevel.LOW: False,
            RiskLevel.MEDIUM: True,
            RiskLevel.HIGH: True,
            RiskLevel.CRITICAL: True,
        }
        
        # Auto-deny critical actions
        self.auto_deny = {RiskLevel.CRITICAL}
        
        # Auto-approve based on conditions
        self.auto_approve_conditions: List[Callable[[str, Dict], bool]] = []
    
    def should_request_approval(self, risk: RiskLevel, action_name: str, params: Dict) -> bool:
        """Check if approval should be requested"""
        
        # Auto-deny critical actions
        if risk in self.auto_deny:
            return False
        
        # Check auto-approve conditions
        for condition in self.auto_approve_conditions:
            if condition(action_name, params):
                return False
        
        return self.require_approval.get(risk, True)
    
    def add_auto_approve_condition(self, condition: Callable[[str, Dict], bool]):
        """Add condition for auto-approval"""
        self.auto_approve_conditions.append(condition)

class BaseAIAgent(ABC):
    """Base class for AI agents with AFK integration"""
    
    def __init__(self, session_id: str = None, **kwargs):
        self.afk = AFKIntegration(session_id)
        self.risk_assessor = RiskAssessor()
        self.approval_policy = ApprovalPolicy()
        self.logger = logging.getLogger(self.__class__.__name__)
        
        # Configure logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        
        # Start session
        self.afk.notify_session_start()
        self.logger.info(f"AI Agent started with session: {self.afk.session_id}")
        
        # Custom initialization
        self.initialize(**kwargs)
    
    @abstractmethod
    def initialize(self, **kwargs):
        """Initialize agent-specific configuration"""
        pass
    
    def execute_action(self, action_name: str, action_params: Dict[str, Any]) -> ActionResult:
        """Execute an action with risk assessment and approval"""
        
        try:
            # Assess risk
            risk = self.risk_assessor.assess(action_name, action_params)
            self.logger.info(f"Action '{action_name}' assessed as {risk.value} risk")
            
            # Check approval policy
            if not self.approval_policy.should_request_approval(risk, action_name, action_params):
                if risk in self.approval_policy.auto_deny:
                    self.logger.warning(f"Action '{action_name}' auto-denied due to {risk.value} risk")
                    return ActionResult(success=False, approved=False, error="Auto-denied due to critical risk")
                else:
                    self.logger.info(f"Action '{action_name}' auto-approved")
                    result = self._perform_action(action_name, action_params)
                    return ActionResult(success=True, approved=True, result=result)
            
            # Request approval
            approved = self.afk.request_approval(action_name, action_params)
            
            if approved:
                self.logger.info(f"Action '{action_name}' approved by user")
                result = self._perform_action(action_name, action_params)
                return ActionResult(success=True, approved=True, result=result)
            else:
                self.logger.info(f"Action '{action_name}' denied by user")
                return ActionResult(success=False, approved=False, error="User denied action")
                
        except Exception as e:
            self.logger.error(f"Error executing action '{action_name}': {e}")
            return ActionResult(success=False, approved=False, error=str(e))
    
    @abstractmethod
    def _perform_action(self, action_name: str, action_params: Dict[str, Any]) -> Any:
        """Perform the actual action (implement in subclass)"""
        pass
    
    def shutdown(self):
        """Clean shutdown"""
        self.logger.info("Shutting down AI agent")
        self.afk.notify_session_end()

# Example implementation
class ExampleAIAgent(BaseAIAgent):
    """Example AI agent implementation"""
    
    def initialize(self, **kwargs):
        """Configure the example agent"""
        
        # Add custom risk assessor
        def custom_risk_assessor(action_name: str, params: Dict) -> Optional[RiskLevel]:
            # Example: always treat file operations in /tmp as low risk
            if action_name == "write_file" and params.get("filepath", "").startswith("/tmp"):
                return RiskLevel.LOW
            return None
        
        self.risk_assessor.add_custom_assessor(custom_risk_assessor)
        
        # Add auto-approve condition
        def auto_approve_read_only(action_name: str, params: Dict) -> bool:
            # Auto-approve read-only operations
            read_only_actions = ["read_file", "list_directory", "analyze_data"]
            return action_name in read_only_actions
        
        self.approval_policy.add_auto_approve_condition(auto_approve_read_only)
    
    def _perform_action(self, action_name: str, action_params: Dict[str, Any]) -> Any:
        """Perform the actual action"""
        
        if action_name == "write_file":
            filepath = action_params["filepath"]
            content = action_params["content"]
            with open(filepath, 'w') as f:
                f.write(content)
            return f"File written: {filepath}"
            
        elif action_name == "execute_code":
            code = action_params["code"]
            exec(code)
            return "Code executed successfully"
            
        elif action_name == "shell_command":
            command = action_params["command"]
            result = subprocess.run(command, shell=True, capture_output=True, text=True)
            return {"stdout": result.stdout, "stderr": result.stderr, "returncode": result.returncode}
            
        elif action_name == "analyze_data":
            data = action_params["data"]
            if isinstance(data, list) and all(isinstance(x, (int, float)) for x in data):
                avg = sum(data) / len(data) if data else 0
                return {"average": avg, "max": max(data) if data else 0, "min": min(data) if data else 0}
            else:
                return {"error": "Invalid data format"}
        
        else:
            return f"Unknown action: {action_name}"

def demo():
    """Demonstrate the generic AI agent template"""
    
    agent = ExampleAIAgent(session_id="generic-demo")
    
    try:
        print("\n--- Demo: Safe Operations (Auto-approved) ---")
        result = agent.execute_action("analyze_data", {"data": [1, 2, 3, 4, 5, 10, 15, 20]})
        print(f"Analysis result: {result.result}")
        
        print("\n--- Demo: Risky Operations (Approval Required) ---")
        
        # Code execution (high risk)
        result = agent.execute_action("execute_code", {"code": "print('Hello from approved code!')"})
        if result.success:
            print(f"Code execution result: {result.result}")
        else:
            print(f"Code execution failed: {result.error}")
        
        # File writing (medium risk, but /tmp is low risk due to custom assessor)
        result = agent.execute_action("write_file", {
            "filepath": "/tmp/ai_agent_test.txt",
            "content": "This file was created by the generic AI agent after user approval."
        })
        if result.success:
            print(f"File write result: {result.result}")
        
        # Shell command (high risk)
        result = agent.execute_action("shell_command", {"command": "echo 'Hello from approved shell command'"})
        if result.success:
            print(f"Shell command result: {result.result}")
        
        # Critical operation (auto-denied)
        result = agent.execute_action("shell_command", {"command": "rm -rf /"})
        print(f"Critical operation result: denied={not result.approved}, error={result.error}")
        
    except KeyboardInterrupt:
        print("\n🛑 Interrupted by user")
    finally:
        agent.shutdown()

if __name__ == "__main__":
    print("🚀 Generic AI Agent Template with AFK Integration")
    print("This template shows how to integrate any AI system with AFK remote control")
    print("Make sure you have AFK installed: npm install -g @probelabs/afk")
    print("And configured: afk setup")
    print()
    
    demo()