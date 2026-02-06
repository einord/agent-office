class_name IdleActionHandler
extends RefCounted

signal action_completed

var agent: Node2D = null
var is_running: bool = false

## Starts the idle action on the given agent.
func start(p_agent: Node2D) -> void:
	agent = p_agent
	is_running = true

## Called each physics frame while the action is running.
func physics_process(delta: float) -> void:
	pass

## Interrupts the action (e.g. when agent leaves IDLE state).
func interrupt() -> void:
	is_running = false
