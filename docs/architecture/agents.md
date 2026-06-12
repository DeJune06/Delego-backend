# Agent Architecture

Delego runs specialized AI agents coordinated by the orchestrator service to handle various commerce tasks on behalf of users.

## 📋 Table of Contents

- [Overview](#overview)
- [Agent Types](#agent-types)
- [Agent Runtime](#agent-runtime)
- [Agent Communication](#agent-communication)
- [Spending Policies](#spending-policies)
- [LLM Provider Abstraction](#llm-provider-abstraction)
- [Tool Registry](#tool-registry)
- [Memory Store](#memory-store)
- [Agent Testing](#agent-testing)

## Overview

The agent architecture enables AI agents to perform commerce tasks while maintaining user control through spending policies, approval workflows, and transparent execution. Agents are coordinated by the orchestrator service and interact with other services via well-defined interfaces.

### Design Principles

- **Specialization**: Each agent has a specific role and responsibility
- **Coordination**: Agents are coordinated by the orchestrator service
- **Constraint**: Agents operate within defined spending policies
- **Transparency**: All agent actions are logged and auditable
- **Extensibility**: New agent types can be added easily

## Agent Types

### Buyer Agent

**Role**: Catalog search, product comparison, purchase initiation

#### Responsibilities

- Search product catalogs across merchants
- Compare products based on user preferences
- Recommend products that match user criteria
- Initiate purchase requests for user approval
- Provide explanations for recommendations

#### Capabilities

- Natural language product search
- Price comparison across merchants
- Review analysis and summarization
- Preference learning and adaptation
- Multi-criteria decision making

#### Tools

- Catalog search API
- Price comparison API
- Review aggregation API
- Merchant inventory API

### Payment Agent

**Role**: Spending policy enforcement, escrow funding

#### Responsibilities

- Enforce spending policies defined in delegations
- Fund escrow contracts for approved purchases
- Monitor spending against limits
- Handle payment failures and retries
- Report spending activity to users

#### Capabilities

- Real-time spending monitoring
- Policy enforcement
- Escrow contract interaction
- Payment retry logic
- Spending analytics

#### Tools

- Permissions contract API
- Escrow contract API
- Wallet service API
- Spending policy engine

### Merchant Agent (Planned)

**Role**: Fulfillment assistance

#### Responsibilities

- Assist merchants with order fulfillment
- Coordinate with delivery services
- Handle inventory management
- Process refunds and returns
- Provide merchant analytics

#### Capabilities

- Order tracking
- Inventory synchronization
- Delivery coordination
- Refund processing
- Merchant insights

#### Tools

- Order management API
- Inventory API
- Delivery API
- Refund API

### Delivery Agent (Planned)

**Role**: Tracking and confirmation

#### Responsibilities

- Track package delivery status
- Confirm delivery completion
- Handle delivery issues
- Coordinate with delivery providers
- Update order status

#### Capabilities

- Real-time tracking
- Delivery confirmation
- Issue resolution
- Provider coordination
- Status updates

#### Tools

- Delivery provider APIs
- Tracking APIs
- Notification APIs

## Agent Runtime

### AgentRunContext

Agents receive an `AgentRunContext` containing all necessary information for execution:

```typescript
interface AgentRunContext {
  delegation: Delegation;      // User delegation configuration
  user: User;                  // User information
  session: Session;            // Current session context
  task: AgentTask;            // Task to execute
  tools: ToolRegistry;        // Available tools
  memory: MemoryStore;         // Agent memory
}
```

### AgentRunResult

Agents return an `AgentRunResult` with execution results:

```typescript
interface AgentRunResult {
  success: boolean;
  actions: AgentAction[];     // Actions taken
  output: any;                // Task output
  explanation: string;        // Explanation of decisions
  nextSteps?: AgentTask[];    // Follow-up tasks
}
```

### Execution Flow

```
1. Orchestrator creates AgentRunContext
2. Agent receives context and task
3. Agent uses tools to execute task
4. Agent returns AgentRunResult
5. Orchestrator processes result
6. Actions are logged and audited
```

## Agent Communication

### Orchestrator Coordination

The orchestrator service coordinates agent execution:

- **Task Assignment**: Assigns tasks to appropriate agents
- **Context Management**: Manages agent execution context
- **Result Processing**: Processes agent results
- **Error Handling**: Handles agent errors and retries
- **Workflow Management**: Manages multi-agent workflows

### Inter-Agent Communication

Agents can communicate with each other:

- **Direct Communication**: Agents can call other agents directly
- **Event-Based**: Agents publish and subscribe to events
- **Shared Memory**: Agents share information via memory store
- **Orchestrator-Mediated**: Orchestrator mediates agent communication

### Service Communication

Agents communicate with backend services:

- **Gateway**: For API calls
- **Wallet**: For wallet operations
- **Payments**: For payment operations
- **Catalog**: For product information
- **Notifications**: For sending notifications

## Spending Policies

### Policy Definition

Spending policies are defined in delegations and constrain all payment actions:

```typescript
interface SpendingPolicy {
  delegationId: string;
  spendingLimit: number;       // Maximum total spend
  approvalThreshold: number;   // Amount requiring approval
  perTransactionLimit: number; // Maximum per transaction
  allowedMerchants: string[];  // Allowed merchant IDs
  timeWindow: TimeWindow;      // Time-based constraints
}
```

### Policy Enforcement

The Payment Agent enforces spending policies:

- **Pre-Transaction**: Check policy before transaction
- **Real-Time**: Monitor spending during execution
- **Post-Transaction**: Update spending totals
- **Violation Handling**: Block policy violations
- **Reporting**: Report policy violations to users

### Policy Types

- **Absolute Limit**: Maximum total spending
- **Per-Transaction Limit**: Maximum per transaction
- **Merchant Restrictions**: Allowed/merchants
- **Time-Based Limits**: Daily, weekly, monthly limits
- **Category Limits**: Limits by product category

## LLM Provider Abstraction

### Provider Interface

The LLM provider abstraction allows swapping LLM providers:

```typescript
interface LLMProvider {
  name: string;
  generate(prompt: string, options: GenerateOptions): Promise<string>;
  chat(messages: Message[], options: ChatOptions): Promise<string>;
  stream(messages: Message[], options: StreamOptions): AsyncGenerator<string>;
}
```

### Supported Providers

- **OpenAI**: GPT-4, GPT-3.5
- **Anthropic**: Claude 3, Claude 2
- **Google**: Gemini Pro, Gemini Ultra
- **Local**: Local LLMs (Ollama, etc.)

### Provider Selection

Providers can be selected based on:

- **Task Requirements**: Different tasks may require different providers
- **Cost**: Cost considerations
- **Performance**: Latency and throughput
- **Capabilities**: Specific capabilities needed
- **User Preference**: User-selected provider

### Prompt Engineering

Agents use structured prompts for consistent behavior:

- **System Prompts**: Define agent role and behavior
- **Task Prompts**: Describe specific tasks
- **Few-Shot Examples**: Provide examples for guidance
- **Chain of Thought**: Enable reasoning steps
- **Output Formatting**: Specify desired output format

## Tool Registry

### Tool Definition

Tools are defined with a standard interface:

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute: (params: any) => Promise<ToolResult>;
}
```

### Tool Categories

- **Search Tools**: Catalog search, product search
- **Comparison Tools**: Price comparison, feature comparison
- **Payment Tools**: Escrow funding, payment execution
- **Communication Tools**: Notification, messaging
- **Analytics Tools**: Spending analytics, performance metrics

### Tool Execution

Agents use tools through the tool registry:

- **Discovery**: Agents discover available tools
- **Selection**: Agents select appropriate tools
- **Execution**: Agents execute tools with parameters
- **Result Processing**: Agents process tool results
- **Error Handling**: Agents handle tool errors

### Tool Safety

Tools include safety mechanisms:

- **Parameter Validation**: Validate tool parameters
- **Rate Limiting**: Rate limit tool usage
- **Permission Checks**: Check tool permissions
- **Audit Logging**: Log tool usage
- **Error Handling**: Handle tool errors gracefully

## Memory Store

### Memory Types

Agents use different types of memory:

- **Short-Term Memory**: Current session context
- **Long-Term Memory**: Persistent user preferences
- **Episodic Memory**: Past interactions and outcomes
- **Semantic Memory**: General knowledge and facts

### Memory Implementation

Memory can be implemented using:

- **In-Memory**: Fast, volatile storage
- **Database**: Persistent storage
- **Vector Database**: For semantic search
- **Cache**: For frequently accessed data

### Memory Operations

Agents perform memory operations:

- **Store**: Store information in memory
- **Retrieve**: Retrieve information from memory
- **Update**: Update existing memory
- **Delete**: Delete from memory
- **Search**: Search memory for relevant information

### Memory Privacy

Memory privacy is ensured through:

- **User Isolation**: Memory isolated by user
- **Encryption**: Memory encrypted at rest
- **Access Control**: Controlled access to memory
- **Retention Policies**: Configurable retention
- **Deletion**: User can delete memory

## Agent Testing

### Unit Testing

Test individual agent components:

- Tool execution
- Policy enforcement
- Memory operations
- LLM integration

### Integration Testing

Test agent integration with services:

- Service communication
- Workflow coordination
- Error handling
- Performance

### End-to-End Testing

Test complete agent workflows:

- User scenarios
- Multi-agent workflows
- Error scenarios
- Performance testing

### Evaluation Metrics

Agent performance is evaluated using:

- **Success Rate**: Percentage of successful tasks
- **Accuracy**: Accuracy of recommendations
- **Efficiency**: Time to complete tasks
- **User Satisfaction**: User feedback
- **Cost**: Cost of execution

## Security Considerations

### Agent Isolation

Agents are isolated to prevent unauthorized access:

- **Sandboxing**: Agents run in sandboxed environments
- **Permission Boundaries**: Agents have limited permissions
- **Resource Limits**: Agents have resource limits
- **Network Restrictions**: Agents have restricted network access

### Input Validation

All agent inputs are validated:

- **Parameter Validation**: Validate tool parameters
- **Prompt Injection Prevention**: Prevent prompt injection attacks
- **Output Sanitization**: Sanitize agent outputs
- **Rate Limiting**: Rate limit agent requests

### Audit Logging

All agent actions are logged:

- **Action Logging**: Log all agent actions
- **Decision Logging**: Log agent decisions
- **Tool Usage**: Log tool usage
- **Error Logging**: Log errors and exceptions

## Future Enhancements

### Multi-Agent Collaboration

Enable agents to collaborate on complex tasks:

- **Agent Teams**: Teams of agents working together
- **Task Decomposition**: Decompose tasks into subtasks
- **Agent Negotiation**: Agents negotiate task allocation
- **Consensus Building**: Agents build consensus on decisions

### Learning and Adaptation

Enable agents to learn and adapt:

- **Reinforcement Learning**: Learn from feedback
- **Transfer Learning**: Transfer knowledge between tasks
- **Online Learning**: Learn continuously
- **Personalization**: Adapt to user preferences

### Advanced Capabilities

Add advanced agent capabilities:

- **Multi-Modal**: Handle images, audio, video
- **Real-Time**: Real-time agent interactions
- **Proactive**: Proactive agent behavior
- **Creative**: Creative agent capabilities

---

**Last Updated**: June 2026
