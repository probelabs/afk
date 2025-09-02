#!/usr/bin/env python3
"""
Simple Python AI Agent with AFK Integration
Uses subprocess calls to AFK binary for remote approval
"""

import os
import json
import subprocess
import time
from typing import Dict, Any, Optional

class AFKIntegration:
    """Simple AFK integration using subprocess calls to afk binary"""
    
    def __init__(self, session_id: str = None):
        self.session_id = session_id or f"python-{os.getpid()}"
        self.cwd = os.getcwd()
    
    def request_approval(
        self, 
        action_name: str, 
        action_params: Dict[str, Any]
    ) -> bool:
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
                timeout=300  # 5 minute timeout
            )
            
            # Return codes: 0=approved, 2=denied, 1=error
            return result.returncode == 0
            
        except subprocess.TimeoutExpired:
            print(f"⏰ Approval timeout for {action_name}")
            return False
        except FileNotFoundError:
            print("❌ AFK binary not found. Install with: npm install -g @probelabs/afk")
            return False
        except Exception as e:
            print(f"🚨 AFK integration error: {e}")
            return False
    
    def notify_session_start(self):
        """Notify AFK of session start"""
        hook_input = {
            "session_id": self.session_id,
            "cwd": self.cwd,
            "transcript_path": f"/tmp/{self.session_id}.jsonl"
        }
        
        subprocess.run(
            ['afk', 'hook', 'sessionstart'],
            input=json.dumps(hook_input),
            text=True,
            capture_output=True
        )
    
    def notify_session_end(self):
        """Notify AFK of session completion"""
        hook_input = {
            "session_id": self.session_id,
            "cwd": self.cwd,
            "stop_hook_active": True
        }
        
        subprocess.run(
            ['afk', 'hook', 'stop'],
            input=json.dumps(hook_input),
            text=True,
            capture_output=True
        )


class SimpleAIAgent:
    """Example AI agent that requests approval for risky actions"""
    
    def __init__(self):
        self.afk = AFKIntegration("simple-ai-agent")
        self.afk.notify_session_start()
        print("🤖 AI Agent started with AFK remote control")
    
    def execute_code(self, code: str):
        """Execute Python code with approval"""
        # Truncate code for mobile display
        display_code = code[:200] + "..." if len(code) > 200 else code
        
        if self.afk.request_approval("execute_code", {
            "code": display_code,
            "language": "python"
        }):
            print(f"✅ Code execution approved")
            print(f"Executing: {code}")
            try:
                exec(code)
            except Exception as e:
                print(f"❌ Execution error: {e}")
        else:
            print(f"❌ Code execution denied by user")
    
    def write_file(self, filepath: str, content: str):
        """Write file with approval"""
        # Truncate content for mobile display  
        display_content = content[:100] + "..." if len(content) > 100 else content
        
        if self.afk.request_approval("write_file", {
            "filepath": filepath,
            "content": display_content,
            "size": len(content)
        }):
            print(f"✅ File write approved: {filepath}")
            with open(filepath, 'w') as f:
                f.write(content)
            print(f"📄 File written: {filepath}")
        else:
            print(f"❌ File write denied: {filepath}")
    
    def shell_command(self, command: str):
        """Execute shell command with approval"""
        if self.afk.request_approval("shell_command", {
            "command": command
        }):
            print(f"✅ Shell command approved: {command}")
            result = subprocess.run(command, shell=True, capture_output=True, text=True)
            print(f"📤 Output: {result.stdout}")
            if result.stderr:
                print(f"⚠️ Stderr: {result.stderr}")
        else:
            print(f"❌ Shell command denied: {command}")
    
    def analyze_data(self, data: list):
        """Analyze data (low-risk, auto-approved)"""
        # This is a safe operation, no approval needed
        print(f"📊 Analyzing {len(data)} data points...")
        
        # Simulate data analysis
        avg = sum(data) / len(data) if data else 0
        maximum = max(data) if data else 0
        minimum = min(data) if data else 0
        
        print(f"📈 Analysis complete:")
        print(f"   Average: {avg:.2f}")
        print(f"   Max: {maximum}")
        print(f"   Min: {minimum}")
    
    def shutdown(self):
        """Clean shutdown with session end notification"""
        print("🏁 AI Agent shutting down...")
        self.afk.notify_session_end()


def demo():
    """Demonstrate the AI agent with various operations"""
    agent = SimpleAIAgent()
    
    try:
        print("\n--- Demo: Safe Operations (No Approval Needed) ---")
        agent.analyze_data([1, 2, 3, 4, 5, 10, 15, 20])
        
        print("\n--- Demo: Risky Operations (Approval Required) ---")
        
        # Code execution (high risk)
        agent.execute_code("print('Hello from approved Python code!')")
        
        # File writing (medium risk)  
        agent.write_file("/tmp/ai_agent_test.txt", "This file was created by the AI agent after user approval.")
        
        # Shell commands (high risk)
        agent.shell_command("echo 'Hello from approved shell command'")
        agent.shell_command("ls -la /tmp/ai_agent_test.txt")
        
        # Dangerous command (should be denied)
        print("\n--- Demo: Dangerous Operation ---")
        agent.shell_command("rm -rf /")  # This should be denied!
        
    except KeyboardInterrupt:
        print("\n🛑 Interrupted by user")
    finally:
        agent.shutdown()


if __name__ == "__main__":
    print("🚀 Python AI Agent with AFK Integration")
    print("This demo shows how to integrate any Python AI with AFK remote control")
    print("Make sure you have AFK installed: npm install -g @probelabs/afk")
    print("And configured: afk setup")
    print()
    
    demo()